#!/bin/bash
set -euf -o pipefail

# Make sure we're in the project directory
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Replace "//@include <file>" with the contents of the file in most recent commit
sed 's/\/\/@include /git show :/e' flickr-twin-template.js > flickr-twin.js
sed -i 's/\/\/disclaimer/\/\/This file was automatically generated by compile.sh from flickr-twin-template.js/' flickr-twin.js


# Build from current changes (untracked)
sed 's/\/\/@include/cat/e' flickr-twin-template.js > flickr-twin-current.js