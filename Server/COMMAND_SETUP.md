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
# Pull image
docker pull tesla/vehicle-command:latest

# Generate TLS cert (for proxy)
mkdir -p config
openssl req -x509 -nodes -newkey ec \
  -pkeyopt ec_paramgen_curve:secp384r1 \
  -pkeyopt ec_param_enc:named_curve \
  -subj '/CN=localhost' \
  -keyout config/tls-key.pem -out config/tls-cert.pem -sha256 -days 3650 \
  -addext "extendedKeyUsage = serverAuth" \
  -addext "keyUsage = digitalSignature, keyAgreement"

# Run proxy (replace path to your tesla-private.pem)
docker run -d --name tesla-proxy \
  -p 4443:4443 \
  -v $(pwd)/config:/config \
  -v $(pwd)/tesla-private.pem:/config/fleet-key.pem \
  tesla/vehicle-command:latest \
  -tls-key /config/tls-key.pem \
  -cert /config/tls-cert.pem \
  -key-file /config/fleet-key.pem \
  -host 0.0.0.0 -port 4443
```

## 4. Configure Server

Set environment variable:

```
TESLA_COMMAND_PROXY_URL=https://your-proxy-host:4443
```

If the proxy runs on the same host as your app (e.g. behind Caddy), use internal URL:

```
TESLA_COMMAND_PROXY_URL=http://localhost:4443
```

Or, if using Docker Compose, use the service name:

```
TESLA_COMMAND_PROXY_URL=http://tesla-proxy:4443
```

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
