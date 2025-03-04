#!/usr/bin/env bash
set -e

npm config get registry 
npm config set registry=https://registry.npmjs.org

echo 'Login'
npm login

# npm version patch
# npm version minor
# npm version major

echo "Publish..."
npm publish --access=public

npm run docs

echo -e "\successful\n"
exit
