# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blink (formerly Galoy) is an opinionated Bitcoin banking platform that provides a GraphQL API to manage Bitcoin/Lightning transactions. It's built to be a reliable, production-ready system that can scale horizontally and handle Bitcoin transactions both on-chain and via the Lightning Network.

## Development Environment Setup

### Prerequisites

1. **Operating System**: MacOS or Linux (Windows not directly supported)
2. **Dependencies**:
   - `nix` with flakes enabled (use [Determinate Nix Installer](https://github.com/DeterminateSystems/nix-installer))
   - `docker` (Docker Desktop or Docker Engine)
   - `direnv` (version >= 2.30)
   - direnv hooked into your shell

### File Descriptor Limit

On some systems, especially macOS and in WSL2, you'll need to increase the file descriptor limit for `buck2`:
```bash
ulimit -n 10240
```

### Getting Started

1. **Enter repository directory**: When you enter the directory with direnv properly set up, nix will bootstrap the environment automatically.
2. **Check if ready to run the stack**:
   ```bash
   buck2 run dev:healthcheck
   ```
3. **Run the stack**:
   ```bash
   buck2 run dev:up
   ```
4. **Access Tilt UI**: Once Tilt starts, access the UI through http://localhost:10350/ to monitor service status.
5. **Test account credentials**: For account login on regtest, use any random mobile number and `000000` as the OTP.
6. **Tear down the stack**:
   ```bash
   buck2 run dev:down
   ```

## Common Development Commands

### Buck2 Commands

```bash
# Health check before running
buck2 run dev:healthcheck

# Start the development environment
buck2 run dev:up

# Stop the development environment
buck2 run dev:down

# View all targets available for a directory
buck2 targets //core/api

# Build a specific target
buck2 build //apps/consent

# Run tests for a Rust component
buck2 run <PATH/TO/DIRECTORY/WITH/BUCK>:test-unit
buck2 run <PATH/TO/DIRECTORY/WITH/BUCK>:test-integration
```

## Code Architecture

### Core Components

1. **API Server**: GraphQL API server in TypeScript/Node.js
   - Public API for client applications
   - Admin API for administrative operations

2. **Wallets**: 
   - Lightning Network integration via LND
   - On-chain Bitcoin transactions
   - Hot wallets for user transactions
   - Cold storage with multi-sig security

3. **Data Storage**:
   - MongoDB for user accounts and transactions (source of truth)
   - Redis for distributed locking and caching
   - Bitcoin Core for cold storage
   - LND's bbolt database for lightning transactions

4. **Services**:
   - Authentication via phone/email/TOTP
   - Payment processing (Lightning/on-chain)
   - Notifications service (push, email)
   - Price tracking
   - Merchant directory

### Key Directories

- `/core`: Main backend services
  - `/core/api`: GraphQL API implementation
  - `/core/notifications`: Notifications service in Rust
  - `/core/api-keys`: API key management service in Rust

- `/apps`: Frontend applications
  - `/apps/dashboard`: Admin dashboard
  - `/apps/pay`: Payment application
  - `/apps/map`: Merchant map
  - `/apps/consent`: OAuth consent screens

- `/dev`: Development environment configuration

## Important Notes

1. The project uses a microservices architecture deployed on Kubernetes
2. Both TypeScript (for API) and Rust (for services) are used
3. Buck2 is used as the build system
4. GraphQL is the primary API interface
5. The system is designed for high availability and horizontal scaling
6. Development is done in a local Docker environment orchestrated with Tilt