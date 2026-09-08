#!/bin/sh
set -eu

umask 077
mkdir -p /pki

if [ ! -f /pki/ca.key ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out /pki/ca.key
  openssl req -x509 -new -key /pki/ca.key -sha256 -days 3650 -subj "/CN=Dexa Local CA" -out /pki/ca.crt
fi

issue_certificate() {
  name="$1"
  usage="$2"
  if [ ! -f "/pki/$name.key" ]; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "/pki/$name.key"
    openssl req -new -key "/pki/$name.key" -subj "/CN=$name" -out "/tmp/$name.csr"
    printf 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=%s\nsubjectAltName=DNS:%s\n' "$usage" "$name" > "/tmp/$name.ext"
    openssl x509 -req -in "/tmp/$name.csr" -CA /pki/ca.crt -CAkey /pki/ca.key -CAcreateserial -days 825 -sha256 -extfile "/tmp/$name.ext" -out "/pki/$name.crt"
  fi
}

issue_certificate gateway clientAuth
issue_certificate identity serverAuth,clientAuth
issue_certificate attendance serverAuth,clientAuth

if [ ! -f /pki/identity-signing.key ]; then
  openssl genpkey -algorithm ED25519 -out /pki/identity-signing.key
  openssl pkey -in /pki/identity-signing.key -pubout -out /pki/identity-signing.pub
fi

chmod 700 /pki
chmod 600 /pki/*.key
chmod 644 /pki/*.crt /pki/*.pub
chown -R 1000:1000 /pki

for key in /pki/*.key; do
  if [ "$(stat -c '%a' "$key")" != "600" ]; then
    echo "Private key permission must be 0600: $key" >&2
    exit 1
  fi
done
