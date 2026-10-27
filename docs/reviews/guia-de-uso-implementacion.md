# Guía de uso — Implementación móvil + backend core

Este documento describe cómo poner en marcha y usar las funcionalidades implementadas entre `vitalBite-movil-app` y `vitalBite-backend-core`.

---

## 1. Puesta en marcha

### Backend (NestJS)

```bash
cd vitalBite-backend-core

# 1. Variables de entorno
cp .env.example .env
# Editar: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, GRAPHQL_PLAYGROUND=true

# 2. Migración de base de datos (incluye tablas diets, diet_meals, diet_items, notifications)
npx prisma migrate dev --name agregar-dietas-notificaciones

# 3. Regenerar cliente Prisma
npx prisma generate

# 4. Iniciar servidor
npm run start:dev
# → API Gateway GraphQL en http://localhost:4000/graphql
```

### App móvil (Expo)

```bash
cd vitalBite-movil-app

npm install       # ya instalado expo-local-authentication y expo-notifications

# Cambiar la IP del API Gateway en src/constants/config.ts si se prueba
# desde un dispositivo físico en otra red local

npm start         # Expo dev server
# Escanea el QR con Expo Go (solo para probar UI, sin push reales)
# Para push reales: npx expo run:android o npx expo run:ios
```

> **IP correcta**: La app se conecta por defecto al API Gateway en
> `192.168.1.148:4000`. Cámbiala a la IP de tu máquina (ej.
> `192.168.x.x:4000`). Ambos dispositivos deben estar en la misma red Wi-Fi.

---

## 2. Registro de paciente (SignUpScreen)

El paciente necesita el **código de consultorio** que le da su nutricionista. Este código es el `slug` del tenant, visible en la respuesta al registrarse como nutricionista.

**Flujo:**
1. Nutricionista se registra → se crea el tenant con un slug único (ej. `clinica-nutrifit`).
2. Paciente abre la app → Crear cuenta → ingresa nombre, email, contraseña y código `clinica-nutrifit`.
3. El backend crea el paciente en ese tenant y le asigna al primer nutricionista activo.
4. La app inicia sesión automáticamente.

**GraphQL (mutation `joinTenant`):**
```graphql
mutation JoinTenant($input: JoinTenantInput!) {
  joinTenant(input: $input) {
    accessToken
    user { id tenantId email firstName lastName roleCode }
  }
}
```

---

## 3. Autenticación biométrica (BiometricAuthScreen)

Al cerrar y reabrir la app, si hay una sesión guardada, el sistema presenta la pantalla biométrica automáticamente.

- **Si el dispositivo tiene huella/Face ID**: se solicita verificación.
- **Si no hay biometría disponible**: la sesión se restaura automáticamente (sin fricción).
- **"Usar contraseña en su lugar"**: navega a LoginScreen y el usuario inicia sesión normalmente.

La sesión biométrica NO expira automáticamente. Para cerrar sesión explícitamente, el usuario debe usar el botón de logout en ProfileScreen.

---

## 4. Módulo de dietas (DietScreen)

El nutricionista asigna un plan de dieta desde el panel web/GraphQL. El paciente lo ve en la app.

**Queries disponibles:**
```graphql
# Dieta activa del paciente
query { myActiveDiet(patientId: "ID") { id name meals { mealType items { name quantity unit calories } } } }

# Historial de dietas
query { dietsByPatient(patientId: "ID") { id name isActive startDate } }
```

**Mutation para asignar (nutricionista):**
```graphql
mutation CreateDiet($input: CreateDietInput!) {
  createDiet(input: $input) {
    id name isActive
  }
}
```

Al crear una dieta, el paciente recibe automáticamente una notificación push `DIETA_ASIGNADA`.

---

## 5. Módulo de notificaciones

### Ver notificaciones
`NotificationScreen` muestra las últimas 50 notificaciones del paciente con filtros por período.

**Operaciones disponibles:**
```graphql
# Listar
query { myNotifications(patientId: "ID") { id type title body isRead createdAt } }

# Contar no leídas
query { unreadNotificationsCount(patientId: "ID") }

# Marcar una como leída
mutation { markNotificationRead(id: "ID") }

# Marcar todas como leídas
mutation { markAllNotificationsRead(patientId: "ID") }
```

### Token push
El token se registra automáticamente al entrar a la app. También puede forzarse con:
```graphql
mutation { registerPushToken(token: "ExponentPushToken[...]") }
```

---

## 6. Perfil del paciente (EditProfileScreen)

El paciente puede editar su nombre, teléfono, fecha de nacimiento y altura desde `EditProfileScreen`.

```graphql
# Leer perfil propio
query { myProfile { id firstName lastName email phone birthDate gender nutritionGoal heightCm } }

# Actualizar
mutation { updateMyProfile(input: { firstName: "Ana", heightCm: 165 }) { id firstName heightCm } }
```

---

## 7. Perfil del nutricionista (NutritionistProfileScreen)

Muestra el nombre y email del nutricionista asignado al paciente.

```graphql
query { myNutritionist { id firstName lastName email roleCode } }
```

---

## 8. Historial de citas (AppointmentHistoryScreen)

Muestra todas las citas pasadas del paciente (estado COMPLETED, CANCELLED, NO_SHOW), con la posibilidad de expandir cada cita para ver notas y motivo de cancelación.

---

## 9. Gráficas de progreso (ProgressChartScreen)

Muestra gráficas para:
- Peso (kg) y BMI → desde `bodyMeasurementsByPatient`
- Grasa %, Músculo (kg), Agua % → desde `bodyCompositionByPatient`

El nutricionista registra los datos desde su panel. El paciente los ve en tiempo real con filtro por período (1 mes / 3 meses / 6 meses / 1 año).

---

## 10. Notificaciones automáticas por evento

| Evento | Quién dispara | Paciente recibe |
|--------|--------------|-----------------|
| Cita creada | Nutricionista | "Cita programada para el [fecha] a las [hora]" |
| Cita confirmada | Nutricionista | "Tu cita del [fecha] ha sido confirmada" |
| Cita reprogramada | Nutricionista | "Tu cita fue reprogramada para el [fecha]" |
| Cita cancelada | Nutricionista | "Tu cita fue cancelada. Motivo: ..." |
| Dieta asignada | Nutricionista | "Nueva dieta asignada: [nombre del plan]" |

Todas son notificaciones push + registro en base de datos.

---

## 11. Requisitos para que las push funcionen

1. El paciente debe haber iniciado sesión y aceptado permisos de notificación.
2. La app debe estar en modo **development build** (no Expo Go) para recibir pushes en dispositivos físicos.
3. El backend debe tener acceso a internet (para llamar a `exp.host/--/api/v2/push/send`).
4. El token debe estar registrado en la BD (`Patient.expoPushToken`).

Para más detalles técnicos de las push, ver `docs/push-notifications.md`.
