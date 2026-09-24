# Credenciales GPS — Soluciones Pinilla

Documento para conectar otro sistema a las mismas plataformas GPS que usa esta app.

Hay **tres proveedores**. Hay que consultar los tres: una placa puede estar en IOP, DS Track, System Track, o en más de uno.

> Nota: en esta app web, System Track se dejó de consultar al conectar DS Track; las credenciales siguen siendo válidas para otros sistemas.

---

## 1. DS Track (Traccar)

Plataforma: [https://dstrack.uno](https://dstrack.uno)  
API: Traccar estándar.

| Variable | Valor |
|---|---|
| URL base | `https://dstrack.uno` |
| Usuario | `solucionespinilla` |
| Contraseña | `SPinilla91222` |

### Autenticación

HTTP Basic Auth. Header:

```
Authorization: Basic <base64(usuario:contraseña)>
```

Ejemplo (el valor ya va en Base64):

```
Authorization: Basic c29sdWNpb25lc3BpbmlsbGE6U1BpbmlsbGE5MTIyMg==
```

También se puede enviar usuario y contraseña en cada request:

```http
GET /api/devices
Authorization: Basic c29sdWNpb25lc3BpbmlsbGE6U1BpbmlsbGE5MTIyMg==
Accept: application/json
```

### Endpoints que usa esta app

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/devices` | Lista de dispositivos |
| GET | `/api/positions` | Última posición de cada dispositivo |
| POST | `/api/commands/send` | Corte / restablecimiento de motor |

Cuerpo del comando de motor:

```json
{ "deviceId": 123, "type": "engineStop" }
```

`type`:

- `engineStop` — apagar / bloquear motor
- `engineResume` — encender / restablecer motor

La velocidad de Traccar viene en **nudos**. Para km/h: `nudos * 1.852`.

La placa suele ir en `device.name` o en `device.attributes.plate`. Muchos equipos se llaman tipo `DS10404` y la placa está en `attributes.plate`.

---

## 2. System Track (GPSWOX)

Plataforma aparte de DS Track. API tipo GPSWOX.

| Variable | Valor |
|---|---|
| URL base | `https://plataforma.sistemagps.online` |
| Email | `marisolpinilla@hotmail.com` |
| Contraseña | `123456` |
| `user_api_hash` (fallback) | `$2y$10$OCkjP58xbNyEeR8MYK4evePR/l2sVfPI.Qj/W2prKGWxG35OnxIve` |

### Autenticación

1. POST a `/api/login` con email y contraseña.
2. Respuesta OK: `status === 1` y `user_api_hash`.
3. Si el login falla, se puede usar el `user_api_hash` de fallback de arriba.

```http
POST /api/login
Content-Type: application/json

{"email":"marisolpinilla@hotmail.com","password":"123456"}
```

### Endpoints

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/login` | Obtener `user_api_hash` |
| GET | `/api/get_devices?user_api_hash=...` | Lista / posición de dispositivos |
| GET | `/api/get_devices_latest?user_api_hash=...` | Posiciones recientes (en vivo) |
| POST | `/api/send_gprs_command` | Comandos GPRS (corte motor, etc.) |

La placa suele ir en `device_data.plate_number` o en `name`.

---

## 3. IOP GPS

API: `https://open.iopgps.com`

Hay **tres cuentas**. Hay que autenticarse y consultar las tres: cada flota vive en una cuenta distinta.

| appid | secretKey |
|---|---|
| `solucionespinilla` | `qr5i85fszplr0m149mskasoyx6fqhwei` |
| `berala37` | `q16guj78wwkxqjh2r7o833qj920rgve0` |
| `all4motosbera` | `tc1z9k9volktkclrz1c6tsh0m2emni7w` |

### Autenticación

1. `time` = Unix timestamp en **segundos** (`Math.floor(Date.now() / 1000)`).
2. Firma: `signature = md5( md5(secretKey) + time )`  
   Ambos MD5 en **hexadecimal minúscula**. Concatenar el hash del secret con el time (como string), y volver a hashear.
3. POST a `https://open.iopgps.com/api/auth`

```json
{
  "appid": "solucionespinilla",
  "time": 1710000000,
  "signature": "<md5(md5(secretKey) + time)>"
}
```

Respuesta OK: `code === 0` y `accessToken`. El token dura ~2 horas.

### Llamadas autenticadas

Header (no es Bearer):

```
accessToken: <token>
Accept: application/json
```

### Endpoints que usa esta app

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth` | Obtener `accessToken` |
| GET | `/api/device?pageSize=100&currentPage=1` | Lista de dispositivos (paginar) |
| GET | `/api/device/status?account=<appid>` | Estado / posición de toda la cuenta |
| POST | `/api/instruction/relay` | Corte / restablecimiento de motor |

Cuerpo del relé:

```json
{
  "code": 0,
  "message": "",
  "parameter": "2",
  "imeis": ["<imei>"]
}
```

`parameter`:

- `"2"` — cortar / bloquear motor
- `"1"` — restablecer / encender motor

La placa se extrae del `deviceName` del dispositivo.

---

## 4. Ejemplo mínimo — Python

```python
import hashlib, time, base64, requests

# --- DS Track ---
user, password = "solucionespinilla", "SPinilla91222"
basic = base64.b64encode(f"{user}:{password}".encode()).decode()
ds = requests.get(
    "https://dstrack.uno/api/devices",
    headers={"Authorization": f"Basic {basic}", "Accept": "application/json"},
    timeout=25,
)
print("DS Track:", ds.status_code, len(ds.json()))

# --- System Track (GPSWOX) ---
st_login = requests.post(
    "https://plataforma.sistemagps.online/api/login",
    json={"email": "marisolpinilla@hotmail.com", "password": "123456"},
    timeout=25,
).json()
st_hash = st_login.get("user_api_hash") or "$2y$10$OCkjP58xbNyEeR8MYK4evePR/l2sVfPI.Qj/W2prKGWxG35OnxIve"
st = requests.get(
    "https://plataforma.sistemagps.online/api/get_devices",
    params={"user_api_hash": st_hash},
    timeout=25,
)
print("System Track:", st.status_code, st_login.get("status"))

# --- IOP GPS ---
def iop_token(appid, secret):
    t = int(time.time())
    signature = hashlib.md5(
        (hashlib.md5(secret.encode()).hexdigest() + str(t)).encode()
    ).hexdigest()
    r = requests.post(
        "https://open.iopgps.com/api/auth",
        json={"appid": appid, "time": t, "signature": signature},
        timeout=30,
    ).json()
    assert r.get("code") == 0, r
    return r["accessToken"]

token = iop_token("solucionespinilla", "qr5i85fszplr0m149mskasoyx6fqhwei")
status = requests.get(
    "https://open.iopgps.com/api/device/status",
    params={"account": "solucionespinilla"},
    headers={"accessToken": token, "Accept": "application/json"},
    timeout=30,
)
print("IOP GPS:", status.status_code, status.json().get("code"))
```

---

## 5. Variables de entorno (si el otro sistema las lee así)

```env
DSTRACK_API_URL=https://dstrack.uno
DSTRACK_USER=solucionespinilla
DSTRACK_PASSWORD=SPinilla91222

SYSTEMTRACK_API_URL=https://plataforma.sistemagps.online
SYSTEMTRACK_EMAIL=marisolpinilla@hotmail.com
SYSTEMTRACK_PASSWORD=123456
SYSTEMTRACK_USER_API_HASH=$2y$10$OCkjP58xbNyEeR8MYK4evePR/l2sVfPI.Qj/W2prKGWxG35OnxIve

IOPGPS_API_URL=https://open.iopgps.com
IOPGPS_CUENTAS_JSON=[{"appid":"solucionespinilla","secretKey":"qr5i85fszplr0m149mskasoyx6fqhwei"},{"appid":"berala37","secretKey":"q16guj78wwkxqjh2r7o833qj920rgve0"},{"appid":"all4motosbera","secretKey":"tc1z9k9volktkclrz1c6tsh0m2emni7w"}]
```

---

**No subir este archivo a un repo público.** Contiene secretos de producción.
