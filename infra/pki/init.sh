#!/bin/sh
set -eu

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for authority in server client; do
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$work/$authority-ca.key"
  openssl req -x509 -new -key "$work/$authority-ca.key" -sha256 -days 3650 -subj "/CN=Dexa $authority CA" -out "$work/$authority-ca.crt"
done

issue_certificate() {
  name="$1"
  usage="$2"
  authority="$3"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/$name.key"
  openssl req -new -key "$work/$name.key" -subj "/CN=$name" -out "$work/$name.csr"
  printf 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=%s\nsubjectAltName=DNS:%s\n' "$usage" "$name" > "$work/$name.ext"
  openssl x509 -req -in "$work/$name.csr" -CA "$work/$authority-ca.crt" -CAkey "$work/$authority-ca.key" -CAcreateserial -days 825 -sha256 -extfile "$work/$name.ext" -out "$work/$name.crt"
}

issue_certificate gateway clientAuth client
issue_certificate identity serverAuth server
issue_certificate attendance serverAuth server
openssl genpkey -algorithm ED25519 -out "$work/identity-signing.key"
openssl pkey -in "$work/identity-signing.key" -pubout -out "$work/identity-signing.pub"

for app in gateway identity attendance; do
  find "/pki/$app" -mindepth 1 -delete
  install -m 0644 "$work/$app.crt" "/pki/$app/"
  install -m 0600 "$work/$app.key" "/pki/$app/"
done
install -m 0644 "$work/server-ca.crt" /pki/gateway/ca.crt
install -m 0644 "$work/client-ca.crt" /pki/identity/ca.crt
install -m 0644 "$work/client-ca.crt" /pki/attendance/ca.crt
install -m 0644 "$work/server-ca.crt" /pki/identity/server-ca.crt
install -m 0644 "$work/server-ca.crt" /pki/attendance/server-ca.crt
install -m 0600 "$work/identity-signing.key" /pki/identity/
install -m 0644 "$work/identity-signing.pub" /pki/identity/
install -m 0644 "$work/identity-signing.pub" /pki/attendance/
chown -R 1000:1000 /pki/gateway /pki/identity /pki/attendance
