# FitFlow

**Equipo:**
- Alessandro Alecio — carnet 21001224
- Joaquín Marroquín — carnet 20004254

FitFlow es una plataforma de reservas de clases de gimnasio, pensada como ejercicio de
arquitectura de microservicios. El sistema está compuesto por tres servicios independientes
(usuarios, reservas y notificaciones), cada uno con su propia base de datos, que se registran
solos en un Service Registry (Consul) para poder encontrarse entre sí sin URLs
hardcodeadas. Además hay un servidor MCP que le permite a un agente de IA (Claude Desktop)
interactuar con el sistema usando lenguaje natural.

Está implementado: los tres microservicios corriendo con Docker Compose, cada uno con su
propia base Postgres, autenticación con JWT, registro y descubrimiento dinámico con Consul,
el servidor MCP con cinco herramientas (listar clases, crear reserva, cancelar reserva,
enviar notificación y consultar historial de notificaciones), resiliencia ante fallos de
`notif-svc` (timeout, retries con backoff/jitter y circuit breaker, con un outbox de
notificaciones pendientes), logs JSON estructurados con `x-correlation-id` en `booking-svc` y
`notif-svc`, rotación de credenciales documentada, y una capa de tres agentes especializados
(Orchestrator, Booking Agent, Notification Agent) que se coordinan entre sí usando el
protocolo A2A.

## Arquitectura

```
                         ┌──────────────────────────┐
                         │        Consul :8500       │
                         │   (service registry +     │
                         │      health checks)        │
                         └───────────┬───────────────┘
                     registro │      │      │ registro
                 ┌────────────┘      │      └────────────┐
                 │                   │ registro           │
                 ▼                   ▼                    ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐
        │   users-svc      │ │  booking-svc     │ │   notif-svc       │
        │   :8003          │ │  :8001           │ │   :8002           │
        │                  │ │                  │ │                   │
        │  users-db (PG)   │ │ booking-db (PG)  │ │  notif-db (PG)    │
        └─────────────────┘ └────────┬─────────┘ └─────────▲─────────┘
                                       │  descubre notif-svc  │
                                       │  vía Consul y llama   │
                                       └───────────────────────┘

                         ┌──────────────────────────┐
                         │      fitflow-mcp :8000     │
                         │  tools: get_available_     │
                         │  classes, create_booking,  │
                         │  cancel_booking             │
                         │  (descubre booking-svc      │
                         │   vía Consul)                │
                         └───────────┬───────────────┘
                                     │ protocolo MCP (Streamable HTTP)
                                     ▼
                         ┌──────────────────────────┐
                         │      Claude Desktop        │
                         │      (cliente MCP)          │
                         └──────────────────────────┘
```

Cada servicio es dueño exclusivo de sus datos: ningún servicio le pega directo a la base de
otro. Si `booking-svc` necesita avisarle algo a `notif-svc`, primero le pregunta a Consul
dónde está (nunca usa una IP fija), y le pega por HTTP a su API.

## Servicios y puertos

| Servicio           | Puerto | Qué hace                                        |
|--------------------|--------|--------------------------------------------------|
| users-svc          | 8003   | Registro y autenticación de usuarios (JWT)       |
| booking-svc        | 8001   | Gestión de reservas de clases                    |
| notif-svc          | 8002   | Envío de notificaciones (por ahora, un log)      |
| fitflow-mcp        | 8000   | Expone FitFlow a agentes de IA vía MCP           |
| consul             | 8500   | Descubrimiento y registro de servicios           |
| orchestrator-agent | 9000   | Interpreta instrucciones y delega a otros agentes|
| booking-agent      | 9001   | Agente A2A especialista en reservas              |
| notification-agent | 9002   | Agente A2A especialista en notificaciones        |

## Cómo correrlo

```bash
git clone <url-del-repo>
cd FitFlow_Proyecto
```

Cada servicio tiene su propio archivo de variables de entorno. Hay que copiarlo y completarlo
en los siete:

```bash
cp users-svc/.env.example users-svc/.env
cp booking-svc/.env.example booking-svc/.env
cp notif-svc/.env.example notif-svc/.env
cp fitflow-mcp/.env.example fitflow-mcp/.env
cp orchestrator-agent/.env.example orchestrator-agent/.env
cp booking-agent/.env.example booking-agent/.env
cp notification-agent/.env.example notification-agent/.env
```

Para `JWT_SECRET` hay que generar un valor random:

```bash
openssl rand -hex 32
```

Ese mismo valor va en `JWT_SECRET` en `users-svc/.env`, `booking-svc/.env` y
`fitflow-mcp/.env` — los tres tienen que compartir el secreto porque `users-svc` firma los
tokens y los otros dos los validan/generan. Los passwords de Postgres pueden ser cualquier
string, cada servicio usa el suyo.

Con eso listo:

```bash
docker compose up --build
```

Esto levanta 11 contenedores: Consul, las tres bases Postgres, y los siete servicios de la
aplicación (los cuatro de antes más los tres agentes A2A). Cuando todo esté arriba:

```bash
curl http://localhost:8003/healthz   # {"status":"ok"}
curl http://localhost:8001/healthz   # {"status":"ok"}
curl http://localhost:8002/healthz   # {"status":"ok"}
```

Y en `http://localhost:8500` se puede ver la UI de Consul con `users-svc`, `booking-svc` y
`notif-svc` en verde (healthy).

## Probar los endpoints

Registrar un usuario y hacer login:

```bash
curl -X POST http://localhost:8003/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@fitflow.test","password":"secret123","name":"Demo User"}'

TOKEN=$(curl -s -X POST http://localhost:8003/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@fitflow.test","password":"secret123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

Ver las clases disponibles (se siembran solas al arrancar `booking-svc`):

```bash
curl http://localhost:8001/classes
```

Crear una reserva (requiere el token del login):

```bash
curl -X POST http://localhost:8001/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"classId":1}'
```

Cancelar esa reserva:

```bash
curl -X DELETE http://localhost:8001/bookings/1 -H "Authorization: Bearer $TOKEN"
```

Ver el historial de notificaciones del usuario (se genera sola cuando se crea una reserva):

```bash
curl http://localhost:8002/notifications/user/1
```

## Resiliencia ante fallos de notif-svc

`booking-svc` llama a `notif-svc` después de crear una reserva, pero nunca bloquea la
respuesta al cliente por eso ni hace que la reserva falle si `notif-svc` está caído. La
llamada (`booking-svc/src/lib/notify.ts`) está envuelta con
[`cockatiel`](https://github.com/connor4312/cockatiel) combinando tres patrones:

- **Timeout de 2s** por intento — si `notif-svc` no responde a tiempo, se aborta la request.
- **Retry con backoff exponencial + jitter** — hasta 3 reintentos, con espera creciente entre
  intentos.
- **Circuit breaker** — si hay 3 fallos consecutivos, el circuito se abre por 30 segundos
  (deja de intentar llamar a `notif-svc` durante ese tiempo, para no saturarlo). Pasado ese
  tiempo prueba una vez ("half-open"); si funciona, se cierra de nuevo.

Mientras el circuito está abierto o cualquier intento falla, la notificación se guarda como
pendiente en la tabla `NotificationOutbox` de la base de `booking-svc` (`status: "pending"`)
en lugar de perderse. Hoy no hay un job que las reprocese automáticamente — queda como
trabajo futuro.

Importante: esto es "persistir al fallar", no un outbox transaccional — el row en
`NotificationOutbox` recién se escribe después de agotar los reintentos (hasta ~11 segundos
después de crear la reserva), así que si `booking-svc` se cae o se reinicia justo en esa
ventana, la notificación se pierde sin dejar ningún registro. Un outbox transaccional real
escribiría la fila dentro de la misma transacción que crea la reserva.

Trabajo futuro relacionado con el outbox:

- Convertir el outbox en un patrón transaccional real (escribir la fila dentro de la misma
  transacción que crea la reserva).
- Los reintentos pueden generar notificaciones duplicadas si `notif-svc` procesó la request
  pero la respuesta no llegó a tiempo (no hay idempotency key ni constraint de unicidad).
- El outbox no guarda `correlationId` ni `bookingId`, así que una fila pendiente no se puede
  enlazar de vuelta a la reserva o al log que la originó.

Para probarlo localmente:

```bash
docker compose stop notif-svc

# hacer 3+ reservas seguidas (usando el $TOKEN de la sección anterior)
for i in 1 2 3; do
  curl -s -X POST http://localhost:8001/bookings \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"classId":1}'
  echo
done

# ver el circuit breaker abrirse y las reservas seguir creándose (201, no 500)
docker compose logs booking-svc --tail 50

# confirmar que las notificaciones fallidas quedaron guardadas
docker compose exec booking-db psql -U booking_app -d booking_db \
  -c 'SELECT * FROM "NotificationOutbox";'

docker compose start notif-svc
```

## Logs estructurados y correlation-id

`booking-svc` y `notif-svc` emiten logs en JSON (vía [`pino`](https://getpino.io)) con al
menos estos campos: `correlation_id`, `service`, `event`, `level`, `timestamp`. Cada request
entrante genera (o reutiliza, si ya viene en el header `x-correlation-id`) un ID único que
viaja de `booking-svc` a `notif-svc` en ese mismo header, permitiendo rastrear un flujo
completo entre ambos servicios:

```bash
docker compose logs booking-svc notif-svc | grep <correlation_id>
```

## Rotación de credenciales

**Password de base de datos (por servicio):** cada servicio es dueño exclusivo de su propia
base, así que rotar su password no afecta al resto del sistema.

1. Crear un nuevo usuario/password en la instancia de Postgres del servicio (o cambiar el
   password del usuario existente con `ALTER USER ... WITH PASSWORD '...'`).
2. Actualizar `DATABASE_URL` (y `POSTGRES_PASSWORD`) en el `.env` de ese servicio.
3. `docker compose up -d --build <servicio>` — solo ese contenedor se reinicia.
4. Confirmar que levantó bien: `curl http://localhost:<puerto>/readyz`.
5. Revocar el password viejo en Postgres.

**`JWT_SECRET`** (compartido por `users-svc`, `booking-svc` y `fitflow-mcp`):

1. Generar un nuevo secreto: `openssl rand -hex 32`.
2. Actualizarlo en los `.env` de los 3 servicios que lo usan.
3. Reiniciar los 3 en secuencia: `docker compose up -d --build users-svc booking-svc fitflow-mcp`.
4. Los tokens emitidos con el secreto viejo dejan de validar de inmediato (no hay soporte a
   doble-secreto). Como duran máximo 2 horas, el impacto se limita a que los usuarios con
   sesión activa tengan que volver a hacer login — se acepta esa breve ventana en vez de
   agregar la complejidad de verificar contra dos secretos simultáneos.

## Conectar Claude Desktop a fitflow-mcp

`fitflow-mcp` corre dentro de Docker Compose y queda expuesto en `http://localhost:8000/mcp`
usando el transporte Streamable HTTP de MCP, en HTTP plano (sin HTTPS, porque es un servidor
local de desarrollo). La opción de "Add custom connector" de Claude Desktop exige que la URL
sea `https://`, así que para un servidor local en HTTP hay que usar `mcp-remote`, un puente
que corre local y traduce entre lo que Claude Desktop espera y nuestro servidor HTTP. No hace
falta instalarlo a mano, `npx` lo descarga solo la primera vez.

1. Abrir el archivo de configuración de Claude Desktop:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Agregar (o crear) la clave `mcpServers` con esta entrada:
   ```json
   {
     "mcpServers": {
       "FitFlow": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://localhost:8000/mcp", "--allow-http"]
       }
     }
   }
   ```
   Si el archivo ya tiene otras claves, esta se agrega al mismo nivel, sin borrar nada de lo
   que ya había.
3. Cerrar Claude Desktop por completo y volver a abrirlo para que cargue la nueva configuración.
4. En un chat nuevo, escribir algo como *"¿qué clases hay disponibles?"* — Claude va a usar
   la herramienta `get_available_classes`, que a su vez descubre `booking-svc` vía Consul y le
   pide la lista real de clases.
5. Para reservar, algo como *"reserva la clase de yoga para el usuario 1"* — Claude usa
   `create_booking`, que crea un JWT válido internamente y llama a `booking-svc` para crear la
   reserva de verdad en la base de datos.

## Agent-to-Agent (A2A)

Hasta acá, para que un agente de IA usara FitFlow, tenía que hablar directo con `fitflow-mcp`
usando el protocolo MCP. Esta sección agrega una capa distinta: en vez de un solo agente que
sabe hacer de todo, hay tres agentes especializados que se coordinan entre sí usando A2A
(Agent-to-Agent), un protocolo abierto pensado justamente para que un agente le delegue
trabajo a otro.

La diferencia con MCP es el tipo de pregunta que resuelve cada uno:

- **MCP** responde "¿cómo un agente usa un sistema externo?" — es la forma en la que Claude (o
  cualquier agente) llama a las herramientas de FitFlow.
- **A2A** responde "¿cómo un agente le delega trabajo a otro agente?" — en vez de un agente que
  sabe reservar, cancelar y notificar, hay agentes especializados que se descubren y se
  coordinan entre sí.

Es la misma idea de los microservicios, aplicada a agentes:

| Microservicios                            | Agentes con A2A                          |
|--------------------------------------------|-------------------------------------------|
| Cada servicio tiene una responsabilidad     | Cada agente tiene una especialidad         |
| Se registran en Consul (service registry)   | Se publican con un Agent Card (agent registry) |
| Se descubren dinámicamente                  | Se descubren vía Agent Cards               |
| Se comunican por HTTP                       | Se comunican por protocolo A2A             |

### Los tres agentes nuevos

```
Usuario (curl / instrucción en lenguaje natural)
        │  POST /instructions
        ▼
┌──────────────────────┐
│   orchestrator-agent    │  :9000 — interpreta la instrucción, descubre
│                          │  agentes por su Agent Card y les delega tareas
└───────────┬──────────┘
            │ A2A (POST /tasks)
     ┌──────┴───────┐
     ▼              ▼
┌───────────┐  ┌────────────────────┐
│ booking-   │  │ notification-        │
│ agent       │  │ agent                  │
│ :9001       │  │ :9002                  │
└─────┬─────┘  └──────────┬──────────┘
      │  cliente MCP         │  cliente MCP
      └──────────┬───────────┘
                  ▼
           fitflow-mcp :8000
```

- **Orchestrator Agent** — recibe la instrucción, decide qué agente(s) necesita según palabras
  clave (reservar, cancelar, avisar), los descubre pidiendo su Agent Card, y les delega la
  tarea. Esta parte es determinística (por palabras clave), no usa un modelo de lenguaje —
  simplificación consciente para el alcance del curso; en un sistema real, esta interpretación
  la haría un LLM.
- **Booking Agent** — especialista en reservas. Por dentro es cliente MCP de `fitflow-mcp`:
  usa `get_available_classes` para encontrar el ID de la clase por nombre, y después
  `create_booking`/`cancel_booking` para la acción real.
- **Notification Agent** — especialista en notificaciones. También cliente MCP de
  `fitflow-mcp`, usando las herramientas `send_notification` y `get_notification_history`.

Ningún agente se registra en Consul — a propósito. La idea es mostrar que A2A usa su propio
mecanismo de descubrimiento (el Agent Card, publicado en `/.well-known/agent.json`), en
paralelo al de los microservicios, no mezclado con él.

### Probarlo

```bash
curl http://localhost:9000/.well-known/agent.json
curl http://localhost:9001/.well-known/agent.json
curl http://localhost:9002/.well-known/agent.json

curl -X POST http://localhost:9000/instructions \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"instruction":"Reserva yoga para el viernes y avísame por notificación"}'
```

La respuesta trae un `taskId` y el resultado de cada tarea delegada. Para ver la traza
completa de la comunicación entre agentes:

```bash
docker compose logs orchestrator-agent booking-agent notification-agent | grep <taskId>
```

Ese mismo `taskId` aparece en los logs de los tres agentes, mostrando el camino completo: el
Orchestrator recibiendo la instrucción, descubriendo cada agente por su Agent Card, delegando
la tarea, y el resultado volviendo.

## Capturas

![Consul mostrando los tres servicios en verde](docs/screenshots/01-consul-servicios.png)
*Consul (`http://localhost:8500`) con `users-svc`, `booking-svc` y `notif-svc` registrados y
saludables.*

![docker compose up --build corriendo](docs/screenshots/02-docker-compose-up.png)
*Los 8 contenedores levantando con `docker compose up --build`.*

![Conector de FitFlow agregado en Claude Desktop](docs/screenshots/03-claude-desktop-conector.png)
*El conector personalizado apuntando a `http://localhost:8000/mcp` en Claude Desktop.*

![Claude Desktop listando las clases disponibles](docs/screenshots/04-claude-desktop-clases.png)
*Claude respondiendo "¿qué clases hay disponibles?" usando la herramienta
`get_available_classes`.*

![Claude Desktop creando una reserva](docs/screenshots/05-claude-desktop-reserva.png)
*Claude creando una reserva real a través de `create_booking`.*

## Video demo (Checkpoint 1)

[Ver video demo del Checkpoint 1](https://drive.google.com/file/d/1GC7LEsx0JzmTn9E2MxpVzF9etr08Q086/view?usp=sharing)

## Video demo (Checkpoint 2)
[Ver video demo del Checkpoint 2](https://drive.google.com/file/d/1ifnfeapNTgeWwhavH_S9YiL-avF2hbBe/view?usp=sharing) 