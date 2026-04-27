# Unsafe Code Audit

This document tracks the usage of `unsafe` Rust code in the PayStream contracts and their dependencies.

## Contract Source Code

| Component | Unsafe Blocks | Status | Justification |
|-----------|---------------|--------|---------------|
| `paystream-stream` | 0 | ✅ Safe | No `unsafe` blocks used in source code. |
| `paystream-token` | 0 | ✅ Safe | No `unsafe` blocks used in source code. |

The contract source code is strictly audited to ensure zero `unsafe` usage. This is enforced by `cargo-geiger` in the CI pipeline.

## Dependencies

The following dependencies are known to contain `unsafe` code. Their usage has been reviewed to ensure it does not compromise the security of the contracts.

| Dependency | Justification |
|------------|---------------|
| `soroban-sdk` | Uses `unsafe` for host function calls and FFI. This is required for interacting with the Soroban runtime and is maintained by the Stellar Development Foundation. |
| `parity-scale-codec` | (If used) Often uses `unsafe` for performance optimizations in serialization/deserialization. Reviewed for correctness. |

### Note on CI Enforcement
The CI pipeline runs `cargo geiger --deny-unsafe`. This ensures that any *new* `unsafe` code introduced into the **contract source** will fail the build. Unsafe code in dependencies is monitored and must be justified in this document if updated.
