#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${repo_root}/.docs-site"

rm -rf "${source_dir}" "${repo_root}/site"
mkdir -p "${source_dir}/architecture" \
  "${source_dir}/operations" \
  "${source_dir}/engineering-series" \
  "${source_dir}/stylesheets"

cp "${repo_root}/README.md" "${source_dir}/index.md"
cp "${repo_root}/docs/architecture/"*.md "${source_dir}/architecture/"
cp "${repo_root}/docs/operations/"*.md "${source_dir}/operations/"
cp -R "${repo_root}/docs/engineering-series/assets" \
  "${source_dir}/engineering-series/assets"
cp "${repo_root}/docs/engineering-series/"[0-9][0-9]-*.md \
  "${source_dir}/engineering-series/"
cp "${repo_root}/docs/engineering-series/README.md" \
  "${source_dir}/engineering-series/index.md"
cp "${repo_root}/docs/assets/site.css" \
  "${source_dir}/stylesheets/site.css"

# README 在仓库和站点中的深度不同，只在临时站点源中转换链接。
sed -i 's#](docs/architecture/#](architecture/#g; s#](docs/operations/#](operations/#g; s#](docs/engineering-series/#](engineering-series/#g' \
  "${source_dir}/index.md"
sed -i \
  -e 's#](engineering-series/README.md)#](engineering-series/index.md)#g' \
  -e 's#](config/autodev.yml)#](https://github.com/kingfs/AutoDev/blob/main/config/autodev.yml)#g' \
  -e 's#](TESTING.md)#](https://github.com/kingfs/AutoDev/blob/main/TESTING.md)#g' \
  -e 's#](LICENSE)#](https://github.com/kingfs/AutoDev/blob/main/LICENSE)#g' \
  "${source_dir}/index.md"
sed -i 's#](../../README.md)#](../index.md)#g; s#](../architecture/#](../architecture/#g' \
  "${source_dir}/engineering-series/index.md"

cd "${repo_root}"
mkdocs build --strict
