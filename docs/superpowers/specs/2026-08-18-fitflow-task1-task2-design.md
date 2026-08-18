# FitFlow — Task 1 (Microservicios + Docker) y Task 2 (Consul + MCP Server)

Fecha: 2026-08-18
Alcance: Task 1 y Task 2 únicamente. Task 3 (resiliencia/observabilidad), Task 4 (JWT
avanzado/secretos/README final) y Task 5 (A2A) quedan fuera de este spec — se hará JWT y
manejo básico de secretos porque Task 1 y Task 2 ya lo requieren para funcionar, pero no se
implementa circuit breaker, retries, logs estructurados con correlation-id, ni los agentes A2A.

## Objetivo

Construir el sistema FitFlow desde cero: tres microservicios independientes (`users-svc`,
`booking-svc`, `notif-svc`), cada uno con su propia base de datos Postgres, corriendo con
`docker compose up --build`; un Service Registry con Consul donde los tres se registran solos
al arrancar; y un servidor MCP (`fitflow-mcp`) que expone 3 herramientas para que Claude
Desktop pueda listar clases, crear reservas y cancelarlas en lenguaje natural.

## Stack

- Node.js 22 + TypeScript en los 4 servicios.
- Express para los servidores HTTP de `users-svc`, `booking-svc`, `notif-svc`.
- Prisma como ORM, un schema independiente por servicio, cada uno contra su propio Postgres.
- `jsonwebtoken` para firmar/verificar JWT, `bcrypt` para hashear passwords.
- `consul` (cliente npm) para registro y descubrimiento de servicios.
- `@modelcontextprotocol/sdk` para `fitflow-mcp`, con transporte Streamable HTTP.
- Docker + Docker Compose para levantar todo el sistema.

## Estructura del repositorio

```
FitFlow_Proyecto/
├── users-svc/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/users.ts
│   │   ├── middleware/... (si aplica)
│   │   ├── lib/consul.ts
│   │   └── lib/prisma.ts
│   ├── prisma/schema.prisma
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── booking-svc/        (misma forma que users-svc, + prisma/seed.ts)
├── notif-svc/           (misma forma que users-svc)
├── fitflow-mcp/
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/get-available-classes.ts
│   │   ├── tools/create-booking.ts
│   │   ├── tools/cancel-booking.ts
│   │   └── lib/consul.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── docs/
│   ├── superpowers/specs/  (este archivo)
│   └── screenshots/         (capturas para el README, se llena en la fase de entregables)
├── docker-compose.yml
├── .gitignore
└── README.md
```

No hay `package.json` ni `tsconfig.json` compartido en la raíz — cada servicio es
independiente, con sus propias dependencias y su propio build de Docker.

## Modelos de datos (Prisma, un schema por servicio)

**users-svc — `User`**
```
id            Int      @id @default(autoincrement())
email         String   @unique
passwordHash  String
name          String
createdAt     DateTime @default(now())
```

**booking-svc — `Class` y `Booking`**
```
Class {
  id          Int      @id @default(autoincrement())
  name        String
  instructor  String
  schedule    DateTime
  capacity    Int
  booked      Int      @default(0)
}

Booking {
  id         Int      @id @default(autoincrement())
  userId     Int
  classId    Int
  status     String   @default("confirmed")  // confirmed | cancelled
  createdAt  DateTime @default(now())
  class      Class    @relation(fields: [classId], references: [id])
}
```
`booking-svc` siembra ~5 clases de ejemplo (`prisma/seed.ts`) al levantar el contenedor:
Yoga, Spinning, CrossFit, Pilates, Zumba, con horarios e instructor de ejemplo.

**notif-svc — `Notification`**
```
id         Int      @id @default(autoincrement())
userId     Int
message    String
channel    String   @default("log")
status     String   @default("sent")
createdAt  DateTime @default(now())
```

## Contratos de API

### users-svc (`:8003`)

- `POST /users/register` — body `{ email, password, name }` → `201 { id, email, name }`.
  `409` si el email ya existe.
- `POST /users/login` — body `{ email, password }` → `200 { token }` (JWT firmado con
  `JWT_SECRET`, payload `{ userId, email }`, expira en 2h). `401` si credenciales inválidas.
- `GET /users/:id` → `200 { id, email, name, createdAt }` o `404`.
- `GET /healthz` → `200 { status: "ok" }`.
- `GET /readyz` → `200 { status: "ok" }` si Prisma puede hacer un query trivial contra la BD;
  `503` si no.

### booking-svc (`:8001`)

- `GET /classes` → `200 [{ id, name, instructor, schedule, capacity, booked }]`. Público.
- `POST /bookings` — requiere header `Authorization: Bearer <jwt>`. Body `{ classId }` →
  `201 { id, userId, classId, status, createdAt }`. `401` si el token falta/expiró/es inválido,
  `404` si la clase no existe, `409` si ya no hay cupo. Después de crear la reserva, resuelve
  `notif-svc` vía Consul y le hace `POST /notifications` con un mensaje de confirmación
  (llamada best-effort: si notif-svc no responde, se loguea el error pero la reserva ya está
  creada y la respuesta al usuario sigue siendo `201` — sin retries ni circuit breaker, eso es
  Task 3).
- `GET /bookings/:id` → `200 {...}` o `404`. Público (consultar una reserva por ID no requiere
  dueño, tal como pide el PDF).
- `DELETE /bookings/:id` — requiere JWT válido → `200 { id, status: "cancelled" }`, `401` sin
  token válido, `404` si no existe.
- `GET /healthz`, `GET /readyz` (igual patrón que users-svc).

### notif-svc (`:8002`)

- `POST /notifications` — body `{ userId, message, channel? }` → `201 {...}`, y hace
  `console.log` estructurado simple (JSON.stringify, sin correlation-id todavía — eso es
  Task 3).
- `GET /notifications/user/:userId` → `200 [{...}]`.
- `GET /healthz`, `GET /readyz`.

## Autenticación JWT (parte de Task 1, ya que booking-svc la exige desde el inicio)

- `users-svc` firma tokens con `JWT_SECRET` (variable de entorno, igual en `users-svc`,
  `booking-svc` y `fitflow-mcp`).
- `booking-svc` implementa un middleware Express (`requireAuth`) que verifica el header
  `Authorization: Bearer <token>`, decodifica con `jsonwebtoken.verify`, y adjunta
  `req.userId`. Si falla, responde `401 { error: "Unauthorized" }`.
- El manejo completo de secretos (rotación documentada, etc.) es Task 4 y no se cubre aquí,
  pero desde ya ningún secreto va en el código: todo sale de `.env` (con `.env.example`
  versionado y `.env` real en `.gitignore`).

## Consul — registro y descubrimiento (Task 2A)

- Contenedor `consul` (`hashicorp/consul:1.17`, modo dev, puerto `8500`).
- Cada servicio, al arrancar (`src/index.ts`, antes o justo después de levantar el servidor
  HTTP), se registra a sí mismo contra `consul:8500` con: nombre del servicio, dirección
  (nombre del contenedor), puerto, y una health check HTTP apuntando a su propio `/healthz`
  con intervalo de 10s y `deregister_critical_service_after: 30s`.
- `booking-svc` implementa una función `discover(serviceName)` en `src/lib/consul.ts` que
  consulta el catálogo de Consul (`/v1/health/service/<name>?passing=true`) y devuelve
  `host:port` del primer nodo sano. La usa para ubicar `notif-svc` antes de llamarlo — nunca
  hay una URL de `notif-svc` hardcodeada en `booking-svc`.
- `fitflow-mcp` reutiliza la misma lógica de `discover()` para ubicar `booking-svc`.

## fitflow-mcp — MCP Server (Task 2B)

- Corre en su propio contenedor, puerto `8000`, usando `@modelcontextprotocol/sdk` con
  `StreamableHTTPServerTransport` montado en Express en la ruta `/mcp`.
- 3 herramientas:
  - `get_available_classes()` — sin parámetros. Descubre `booking-svc` vía Consul, hace
    `GET /classes`, devuelve la lista al agente.
  - `create_booking({ userId: number, classId: number })` — firma internamente un JWT de
    corta duración (`{ userId }`, expira en 60s) usando el mismo `JWT_SECRET`, descubre
    `booking-svc` vía Consul, hace `POST /bookings` con ese token, devuelve el resultado.
  - `cancel_booking({ userId: number, bookingId: number })` — mismo patrón de token efímero,
    hace `DELETE /bookings/:id`.
- Conexión a Claude Desktop: como conector remoto/personalizado apuntando a
  `http://localhost:8000/mcp` (Settings → Connectors → Add custom connector). Se documenta el
  paso a paso exacto en el README.

## Infraestructura (`docker-compose.yml`)

8 servicios: `consul`, `users-db`, `booking-db`, `notif-db` (los tres `postgres:16-alpine`,
cada uno con su propio volumen y su propio usuario/password vía `.env`), `users-svc`,
`booking-svc`, `notif-svc`, `fitflow-mcp`. Puertos publicados al host exactamente como en la
tabla del PDF: `8003`, `8001`, `8002`, `8000`, `8500`. Las bases de datos no publican puerto al
host (solo red interna de Docker) salvo que se necesite para debug local, en cuyo caso se usa
un puerto distinto al 5432 estándar por servicio para evitar choques.

Cada servicio de aplicación tiene `depends_on` con `condition: service_healthy` hacia su propia
base de datos y hacia `consul`, para que Prisma no intente migrar antes de que Postgres esté
arriba.

## Manejo de secretos (alcance Task 1/2)

- `.env.example` por cada servicio, documentando cada variable sin valores reales.
- `.env` real de cada servicio en `.gitignore` (un único `.gitignore` en la raíz cubre todos).
- Variables: `DATABASE_URL`, `PORT`, `CONSUL_HOST`, `CONSUL_PORT`, y donde aplique
  `JWT_SECRET`.
- La rotación de credenciales documentada paso a paso es parte de Task 4 y no se cubre en este
  spec.

## Testing

No se agregan suites de tests automatizados — no es parte de los criterios de evaluación de
Task 1/2 y el foco es tener el sistema funcionando end-to-end. La verificación es manual, vía
los `curl` y pasos descritos en "Entregables" abajo.

## Entregables y checkpoints de verificación

**Task 1:**
```
docker compose up --build
curl http://localhost:8003/healthz   # {"status":"ok"}
curl http://localhost:8001/healthz   # {"status":"ok"}
curl http://localhost:8002/healthz   # {"status":"ok"}
```

**Task 2:**
- `http://localhost:8500` muestra `users-svc`, `booking-svc`, `notif-svc` en verde (healthy).
- Desde Claude Desktop, conectado a `fitflow-mcp` vía conector remoto: preguntar "¿qué clases
  hay disponibles?" y que Claude devuelva la lista real de `booking-svc`, y "reserva la clase
  de yoga para el usuario 1" y que se cree la reserva de verdad en la BD.

## README

Se escribe en español, tono natural y estudiantil, sin referencias al enunciado del proyecto.
Secciones: introducción breve al proyecto, diagrama de arquitectura en ASCII art, tabla de
servicios/puertos, cómo correrlo (`git clone` → `cp .env.example .env` en cada servicio →
`docker compose up --build`), cómo probar cada endpoint con `curl`, cómo conectar Claude
Desktop a `fitflow-mcp`, y una sección de capturas de pantalla con las imágenes ya insertadas
(`docs/screenshots/...`). Las capturas se toman en la fase final, una vez el sistema esté
levantado y probado; en ese momento se le indica al usuario exactamente qué pantalla capturar
y con qué nombre de archivo guardarla.

## Fuera de alcance (explícito)

Circuit breaker, retries con backoff, timeouts a notif-svc, logs JSON estructurados con
x-correlation-id, rotación de secretos documentada, agentes A2A, despliegue en cloud. Todo
esto es Task 3, 4 o 5, o puntos extra, y no se implementa en este ciclo.
