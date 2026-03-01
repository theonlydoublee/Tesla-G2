# Tesla Vehicle Command Setup (Fix 403 Forbidden)

Tesla Fleet API returns 403 for vehicle commands (lock, unlock, etc.) unless commands are **signed** with a virtual key. For most vehicles, you must route commands through Tesla's **Vehicle Command Proxy** (`tesla-http-proxy`), which signs them before sending to Fleet API.

## Quick Summary

1. Generate a key pair (public/private)
2. Register the public key with Tesla
3. Run `tesla-http-proxy` (Docker)
4. Set `TESLA_COMMAND_PROXY_URL` in your server env
5. Users must enroll your app's key on their vehicle

## 1. Generate Key Pair

```bash
# Using tesla-keygen (from vehicle-command repo)
go install github.com/teslamotors/vehicle-command/cmd/tesla-keygen@latest
export TESLA_KEY_NAME=myapp
tesla-keygen create > public_key.pem

# Or using OpenSSL (prime256v1 required)
openssl ecparam -name prime256v1 -genkey -noout -out private_key.pem
openssl ec -in private_key.pem -pubout -out public_key.pem
```

## 2. Register Public Key with Tesla

1. Host your public key at:
   ```
   https://even.thedevcave.xyz/.well-known/appspecific/com.tesla.3p.public-key.pem
   ```
2. Call Tesla Partner API register endpoint with your domain. See:
   - [Tesla Partner Endpoints - Register](https://developer.tesla.com/docs/fleet-api/endpoints/partner-endpoints#register)
   - [Tesla Virtual Keys Developer Guide](https://developer.tesla.com/docs/fleet-api/virtual-keys/developer-guide)

## 3. Run Tesla HTTP Proxy (Docker)

```bash
# Create directory (e.g. /root/tesla-proxy) and cd into it
mkdir -p /root/tesla-proxy
cd /root/tesla-proxy

# TLS cert (secp384r1) - MUST be different from fleet-key
openssl req -x509 -nodes -newkey ec \
  -pkeyopt ec_paramgen_curve:secp384r1 \
  -pkeyopt ec_param_enc:named_curve \
  -subj '/CN=localhost' \
  -keyout tls-key.pem -out tls-cert.pem -sha256 -days 3650 \
  -addext "extendedKeyUsage = serverAuth" \
  -addext "keyUsage = digitalSignature, keyAgreement"

# Fleet key (prime256v1) - for Tesla command signing, register with Tesla
openssl ecparam -name prime256v1 -genkey -noout -out fleet-key.pem

# Run proxy (Tesla official command)
# Use -host localhost to avoid the "Do not listen" warning - proxy listens only on localhost.
docker run -d --name tesla-proxy \
  --security-opt=no-new-privileges:true \
  -v /root/tesla-proxy:/config \
  -p 127.0.0.1:4443:4443 \
  tesla/vehicle-command:latest \
  -tls-key /config/tls-key.pem \
  -cert /config/tls-cert.pem \
  -key-file /config/fleet-key.pem \
  -host localhost -port 4443
```

**Important:** `tls-key.pem` and `fleet-key.pem` must be **different keys**. The proxy exits if they match. Use secp384r1 for TLS (above) and prime256v1 for fleet-key.

**Troubleshooting:** If the container exits, run without `-d` to see the full error:
```bash
docker run --rm -v /root/tesla-proxy:/config -p 127.0.0.1:4443:4443 \
  tesla/vehicle-command:latest \
  -tls-key /config/tls-key.pem -cert /config/tls-cert.pem -key-file /config/fleet-key.pem \
  -host localhost -port 4443
```

## 4. Configure Server

Set environment variable (proxy uses HTTPS):

```
TESLA_COMMAND_PROXY_URL=https://localhost:4443
```

If the proxy runs on a different host, use its URL:

```
TESLA_COMMAND_PROXY_URL=https://your-proxy-host:4443
```

**Self-signed cert:** The server accepts the proxy's self-signed cert automatically when `TESLA_COMMAND_PROXY_URL` is set.

## 5. User Enrollment

Each user must add your app's key to their vehicle:

1. Provide them the link: `https://tesla.com/_ak/even.thedevcave.xyz`
2. They open it in the Tesla mobile app
3. They approve adding the key to the vehicle
4. The vehicle must be online and paired with the phone

## References

- [Tesla Vehicle Command SDK](https://github.com/teslamotors/vehicle-command)
- [Tesla Fleet API - Vehicle Commands](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-commands)
- [Tesla Virtual Keys Developer Guide](https://developer.tesla.com/docs/fleet-api/virtual-keys/developer-guide)
