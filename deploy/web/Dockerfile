# Web tier: nginx serving the prebuilt, precompressed static tree. Build the tree first:
#   scripts/build-static.sh <sha>     (writes deploy/web/dist/ and deploy/web/dist-br/)
FROM nginx:1.29-alpine
RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/snippets
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY snippets/ /etc/nginx/snippets/
COPY errors/ /usr/share/nginx/errors/
COPY dist/ /usr/share/nginx/html/
COPY dist-br/ /usr/share/nginx/br/
COPY --chmod=755 legal-v2.sh /docker-entrypoint.d/40-legal-v2.sh
