FROM busybox:1.37.0-musl AS health
FROM postgrest/postgrest:v12.2.12
COPY --from=health /bin/busybox /bin/busybox
