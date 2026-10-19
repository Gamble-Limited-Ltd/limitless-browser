# epoxy-server (Mercury Workshop), a Wisp relay. License: AGPL-3.0 (see docs/HOSTING-AND-PERFORMANCE.md).
# Built unmodified from a pinned commit. Source: https://github.com/MercuryWorkshop/epoxy-tls
# Build:  docker build -t limitless-relay:dev deploy/relay
ARG EPOXY_SHA=0c11678d72a636c3a4bc723db87e03e7b888eaf9
ARG RUST_NIGHTLY=nightly-2026-03-20

FROM rust:1-bookworm AS build
ARG EPOXY_SHA
ARG RUST_NIGHTLY
RUN apt-get update && apt-get install -y --no-install-recommends git cmake pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# The repo pins "nightly" in rust-toolchain.toml; pin a dated nightly instead for repeatable builds.
RUN rustup toolchain install "${RUST_NIGHTLY}" --profile minimal
ENV RUSTUP_TOOLCHAIN=${RUST_NIGHTLY}
WORKDIR /src
RUN git init . && git remote add origin https://github.com/MercuryWorkshop/epoxy-tls \
    && git fetch --depth 1 origin "${EPOXY_SHA}" && git checkout FETCH_HEAD \
    && rm -f rust-toolchain.toml
RUN cargo build --release -p epoxy-server --features speed-limit \
    && strip target/release/epoxy-server \
    && cp server/LICENSE /LICENSE.epoxy-server

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/epoxy-server /usr/local/bin/epoxy-server
COPY --from=build /LICENSE.epoxy-server /licenses/epoxy-server-AGPL-3.0.txt
COPY config.toml /etc/epoxy/config.toml
USER nonroot
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/epoxy-server", "/etc/epoxy/config.toml"]
