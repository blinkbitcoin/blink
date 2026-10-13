"""Package a standalone pnpm script with its shared subprocess helper."""

def _pnpm_script_impl(ctx):
    bundle = ctx.actions.copied_dir("script", {
        ctx.attrs.src.basename: ctx.attrs.src,
        "subprocess_util.py": ctx.attrs._subprocess_util,
    })
    return [DefaultInfo(
        default_output = bundle.project(ctx.attrs.src.basename),
        other_outputs = [bundle],
    )]

pnpm_script = rule(
    impl = _pnpm_script_impl,
    attrs = {
        "src": attrs.source(),
        "_subprocess_util": attrs.source(default = "toolchains//:subprocess_util.py"),
    },
)
