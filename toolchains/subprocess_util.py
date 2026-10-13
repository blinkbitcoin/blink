"""Bounded subprocess execution for the pnpm build scripts (POSIX)."""
import os
import signal
import selectors
import subprocess
import sys
import threading
import time


# Limits are per stream, in bytes. Decode only the retained tail so reads can
# split UTF-8 characters without corrupting them. A truncated prefix is replaced.
OUTPUT_TAIL_BYTES = 256 * 1024
READ_CHUNK_BYTES = 64 * 1024


class _OutputCapture:
    def __init__(self):
        self.tails = [bytearray(), bytearray()]

    def output(self):
        return tuple(bytes(tail) for tail in self.tails)

    def drain(self, process, timeout):
        deadline = None if timeout is None else time.monotonic() + timeout

        def remaining():
            if deadline is None:
                return None
            left = deadline - time.monotonic()
            if left <= 0:
                assert timeout is not None
                raise subprocess.TimeoutExpired(process.args, timeout)
            return left

        # Recreate registrations on cleanup, retaining bytes from before the
        # interruption. Nonblocking reads avoid hangs even with inherited pipes.
        with selectors.DefaultSelector() as selector:
            for stream, tail in zip((process.stdout, process.stderr), self.tails):
                if not stream.closed:
                    os.set_blocking(stream.fileno(), False)
                    selector.register(stream, selectors.EVENT_READ, (stream, tail))
            while selector.get_map():
                for key, _ in selector.select(remaining()):
                    remaining()
                    try:
                        chunk = os.read(key.fd, READ_CHUNK_BYTES)
                    except BlockingIOError:
                        continue
                    stream, tail = key.data
                    if not chunk:
                        selector.unregister(stream)
                        stream.close()
                        continue
                    tail.extend(chunk)
                    if len(tail) > OUTPUT_TAIL_BYTES:
                        del tail[:-OUTPUT_TAIL_BYTES]
            # EOF does not imply the child exited (it may close its own pipes).
            process.wait(timeout=remaining())


def _text(output):
    # Diagnostic tails can begin or end within a multibyte character.
    if isinstance(output, bytes):
        return output.decode(errors="replace")
    return output or ""


def _diagnostics(stdout, stderr):
    print("STDOUT:", file=sys.stderr)
    print(_text(stdout), file=sys.stderr)
    print("STDERR:", file=sys.stderr)
    print(_text(stderr), file=sys.stderr)


def _stop_and_drain(process, capture, cleanup_timeout):
    # Also kill descendants when the parent has already exited but they still
    # hold its pipes. A detached descendant may escape this process group.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except OSError as error:
        print(f"Warning: could not kill process group: {error}", file=sys.stderr)

    try:
        capture.drain(process, cleanup_timeout)
    except (subprocess.TimeoutExpired, OSError) as error:
        if isinstance(error, subprocess.TimeoutExpired):
            print("Error: timed out draining command output during cleanup", file=sys.stderr)
        else:
            print(f"Warning: could not drain command output: {error}", file=sys.stderr)
        # Never wait for EOF from a descendant which escaped the process group.
        process.stdout.close()
        process.stderr.close()
        if process.poll() is None:
            try:
                process.kill()
            except OSError as kill_error:
                print(f"Warning: could not kill command: {kill_error}", file=sys.stderr)
        try:
            process.wait(timeout=cleanup_timeout)
        except subprocess.TimeoutExpired:
            print("Warning: command could not be reaped before cleanup timeout", file=sys.stderr)
    return capture.output()


def _terminate(signum, _frame):
    # SIGTERM does not raise by default. Convert it to an exception so that the
    # same cleanup used for KeyboardInterrupt runs before the wrapper exits.
    raise SystemExit(128 + signum)


def run_command(cmd, cwd=None, timeout=1800, *, env=None, cleanup_timeout=30):
    """Drain both streams, preserve failures, and bound timeout/cancel cleanup.

    Retain only the last OUTPUT_TAIL_BYTES bytes of each stream in memory.
    Cleanup takes at most two cleanup_timeout intervals (drain, then reap).
    Detached descendants cannot be killed as a group, but cannot hold us open.
    """
    print(f"Running command: {' '.join(cmd)}", file=sys.stderr)
    handle_signals = threading.current_thread() is threading.main_thread()
    starting = True
    pending_signals = []
    previous_handlers = {}
    capture = _OutputCapture()

    def cancel(signum, frame):
        # Raising inside Popen can lose an already-spawned child's handle.
        # Defer until assignment and entry into the cleanup-protected block.
        if starting:
            pending_signals.append((signum, frame))
        elif signum == signal.SIGTERM:
            _terminate(signum, frame)
        else:
            previous_handlers[signum](signum, frame)

    try:
        if handle_signals:
            previous_handlers[signal.SIGTERM] = signal.getsignal(signal.SIGTERM)
            signal.signal(signal.SIGTERM, cancel)
            previous_sigint = signal.getsignal(signal.SIGINT)
            # Preserve ignored/default SIGINT dispositions and custom handlers.
            if callable(previous_sigint):
                previous_handlers[signal.SIGINT] = previous_sigint
                signal.signal(signal.SIGINT, cancel)
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            start_new_session=True,
        )
        try:
            starting = False
            for signum, frame in pending_signals:
                cancel(signum, frame)
            capture.drain(process, timeout)
            stdout, stderr = capture.output()
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            print(f"Error: Command timed out after {timeout} seconds", file=sys.stderr)
            stdout, stderr = _stop_and_drain(process, capture, cleanup_timeout)
            exit_code = 1
            print(f"Command return code after cleanup: {process.returncode}", file=sys.stderr)
        except BaseException:
            # Includes SIGINT, SIGTERM, and errors while reading command output.
            stdout, stderr = _stop_and_drain(process, capture, cleanup_timeout)
            _diagnostics(stdout, stderr)
            raise

        if exit_code != 0:
            print(f"Command failed with exit code {exit_code}", file=sys.stderr)
            _diagnostics(stdout, stderr)
        return exit_code
    except Exception as error:
        print(f"Error running command: {error}", file=sys.stderr)
        return 1
    finally:
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
