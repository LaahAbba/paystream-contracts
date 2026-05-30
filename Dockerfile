# syntax=docker/dockerfile:1
FROM rust:1.82-slim AS builder

# Install wasm target and stellar CLI
RUN rustup target add wasm32-unknown-unknown && \
    cargo install --locked stellar-cli --version 22.0.0

WORKDIR /app
COPY . .

# Build all contracts
RUN stellar contract build

# ── test stage ────────────────────────────────────────────────────────────────
FROM builder AS test
CMD ["cargo", "test"]

# ── output stage: WASM artifacts only (~scratch-sized) ───────────────────────
FROM scratch AS output
COPY --from=builder /app/target/wasm32-unknown-unknown/release/*.wasm /contracts/
