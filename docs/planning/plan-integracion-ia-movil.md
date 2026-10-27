# Plan de Integración — Módulo de IA ↔ App Móvil (Escáner Nutricional CU9)

> **Fecha:** 2026-06-06
> **Alcance:** Conectar el escáner nutricional de la app móvil (paciente) con el
> microservicio de IA (`vitalBite-backend-ia`, FastAPI). Modos *plato* (CNN) y
> *etiqueta* (OCR).
> **Stack:** React Native 0.81 · Expo SDK 54 · TypeScript · FastAPI (REST) ·
> EasyOCR + MobileNetV2.
> **Referencias:** `vitalBite-backend-ia/docs/resumen_implementacion.md`,
> `plan_diseno_pantallas.md` (§3.8 F-01/F-02/F-03).

---

## 1. Contexto y objetivo

El escáner nutricional es la funcionalidad de IA exclusiva de la app móvil
(CU_P04 etiqueta / CU_P05 plato). El backend de IA ya expone
`POST /api/v1/food-scan` que:

- **Modo `plate`:** clasifica el plato con una CNN (MobileNetV2 entrenada con
  Food-101) y devuelve el top-3 de alimentos con su confianza.
- **Modo `label`:** extrae nutrientes de la etiqueta con OCR (EasyOCR).

En ambos casos calcula un **semáforo** (`SEGURO` / `PRECAUCION` / `RIESGO`) con
advertencias. La app tenía las pantallas del escáner **mockeadas**; este plan las
conecta al backend real, añade **cámara y linterna nativas**, y deja todo
probado en un teléfono físico.

> CU10 (Random Forest) y CU11 (K-means) son del **panel web del nutricionista**
> (CU_N07 / CU_N08), fuera del alcance de la app móvil.

---

## 2. Estado de la integración

| Componente | Antes | Después |
|------------|-------|---------|
| Pantallas escáner (Home/Cámara/Resultado) | Mock estático | Conectadas al backend de IA |
| Cámara | Simulada (mockup) | `expo-camera` (CameraView) real |
| Linterna (componente nativo) | Botón sin efecto | `enableTorch` nativo |
| Galería | Icono sin acción | `expo-image-picker` |
| Cliente de IA | Inexistente | `src/services/ia.service.ts` (REST) |
| OCR de etiquetas en backend | 503 (sin deps) | Habilitado (opencv + easyocr) |

---

## 3. Contrato del endpoint de IA

`POST {API_BASE_URL}/api/v1/ia/food-scan` · `Content-Type: multipart/form-data` ·
Cabecera `X-API-Key: <clave>`.

**Request (form-data):**

| Campo | Tipo | Valor |
|-------|------|-------|
| `image` | archivo | imagen JPEG/PNG/WEBP (< 5 MB) |
| `mode` | texto | `label` \| `plate` |
| `patient_id` | texto | UUID del paciente autenticado |

**Response 200 (`FoodScanResponse`):**

```jsonc
{
  "modo": "plate",
  "semaforo": "RIESGO",                 // SEGURO | PRECAUCION | RIESGO
  "advertencias": ["⚡ Categoría de alimento de alto procesamiento"],
  "nutrientes": {                        // poblado en modo "label"
    "calorias": 250, "carbohidratos_g": 30, "proteinas_g": 5,
    "grasas_totales_g": 12, "grasas_saturadas_g": 4,
    "sodio_mg": 720, "azucares_g": 18, "fibra_g": 3,
    "ingredientes": ["harina", "maní", "azúcar"]
  },
  "predicciones_alimento": [             // poblado en modo "plate"
    { "clase": "pizza", "probabilidad": 0.87 }
  ],
  "confianza": 0.87,
  "requiere_retoma": false,
  "mensaje_retoma": null
}
```

**Errores:** `401/403` (API Key), `413` (imagen > 5 MB), `422` (formato/datos),
`503` (modelo/OCR no disponible).

---

## 4. Arquitectura de la llamada

```
App Móvil (paciente)
   │  cámara/galería → imageUri local
   │  POST /api/v1/food-scan  (multipart: image, mode, patient_id)
   │  X-API-Key
   ▼
FastAPI IA (192.168.1.148:8001)
   │  modo plate → CNN MobileNetV2     │  modo label → EasyOCR + parseo
   │  → semáforo + advertencias        │
   ▼
Respuesta JSON → pantalla de Resultado
```

> A diferencia del resto de la app (GraphQL/Apollo al Core), el escáner llama al
> backend de IA por **REST directo**. Es válido por AGENTS.md: la IA es un
> servicio interno de inferencia; GraphQL solo es obligatorio cliente ↔ Core.

---

## 5. Configuración de red

| Parámetro | Valor | Dónde |
|-----------|-------|-------|
| `API_BASE_URL` | URL publica del API Gateway | `src/constants/config.ts` |
| Backend bind | `uvicorn --host 0.0.0.0 --port 8001` | PC servidora |
| Firewall | inbound TCP 8001 | Windows |
| Red | teléfono y PC en la **misma Wi-Fi** | — |

Verificación: el teléfono debe abrir `http://192.168.1.148:8001/api/v1/health`.

---

## 6. Cambios por pantalla y archivos

### F-01 · Escáner — Home (`ScannerHomeScreen.tsx`)

```
┌───────────────────────────────┐
│  ¿Qué deseas escanear?        │
│  [🍽  Escanear plato      ›]  │
│  [🏷  Escanear etiqueta   ›]  │
└───────────────────────────────┘
```

- Selección de **modo** antes de abrir cámara → navega a `ScannerCamera { mode }`.
- Reusa `GradientHeader`, `LinearGradient`, `colors`.

### F-02 · Escáner — Cámara (`ScannerCameraScreen.tsx`)

```
┌───────────────────────────────┐
│ ✕            Plato        ⚡   │  ← linterna (enableTorch)
│        ┌───────────┐          │
│        │  guía      │          │
│        └───────────┘          │
│      Enfoca el plato...        │
│  [🖼]        ( ◉ )       ·     │  ← galería · capturar
└───────────────────────────────┘
```

- `CameraView` (`expo-camera`) + `useCameraPermissions` (pantalla de permiso).
- **Linterna nativa** con `enableTorch` (componente nativo del criterio).
- Captura `takePictureAsync({ quality: 0.7 })`; galería con `expo-image-picker`.
- Al capturar → `navigation.replace('ScannerResult', { imageUri, mode })`.

### F-03 · Escáner — Resultado (`ScannerResultScreen.tsx`)

```
┌───────────────────────────────┐
│ [vista previa de la imagen]    │
│ ✅/⚠️/⛔  Semáforo  · conf 87% │
│ Alimento: Pizza 87% / ...      │  (plato)
│ Calorías 250 · P/C/G · ingr.   │  (etiqueta)
│ ⚠️ Advertencias ...            │
│ [Escanear otro] [Volver]       │
└───────────────────────────────┘
```

- Al montar llama a `ia.service.scanFood` (spinner de carga).
- **Semáforo** coloreado: `SEGURO→success`, `PRECAUCION→warning`, `RIESGO→danger`.
- Modo `plate`: lista `predicciones_alimento`. Modo `label`: calorías + macros +
  ingredientes (reusa `MacroChip`).
- `requiere_retoma` → tarjeta con `mensaje_retoma`. Estados de **error** con
  reintento. `patient_id` desde `useAuth()`.

### Servicio y configuración

- `src/services/ia.service.ts` — `scanFood()`, `checkIaHealth()`, tipos
  (`FoodScanResult`, `Semaforo`, `NutrientInfo`, `FoodPrediction`), `IaServiceError`.
- `src/constants/config.ts` — `API_BASE_URL`, `GRAPHQL_URL`, `IA_FOOD_SCAN_URL`.
- `src/navigation/types.ts` — params de `ScannerCamera`/`ScannerResult`.
- `app.json` — plugins/permiso de `expo-camera` y `expo-image-picker`.

---

## 7. Componentes nativos (criterio de evaluación)

| Componente | Implementación | Pantalla |
|------------|----------------|----------|
| **Cámara** | `expo-camera` `CameraView` + `takePictureAsync` | F-02 |
| **Linterna** | prop `enableTorch` de `CameraView` | F-02 |
| **Huella digital** | `expo-local-authentication` (ya existente) | BiometricAuth |
| **Galería** | `expo-image-picker` | F-02 |

---

## 8. Fases de implementación

| # | Tarea | Área | Estado |
|---|-------|------|--------|
| 1 | Habilitar OCR (opencv + easyocr) y exponer IA en LAN | Backend | ✅ |
| 2 | `config.ts` + `ia.service.ts` (cliente REST) | Móvil | ✅ |
| 3 | `expo install expo-camera expo-image-picker` + `app.json` | Móvil | ✅ |
| 4 | Reescribir F-01 / F-02 / F-03 + params de navegación | Móvil | ✅ |
| 5 | Development build (EAS) + pruebas en teléfono | DevOps | ⏳ (manual) |

---

## 9. Guía de pruebas en el teléfono (development build, EAS)

**Prerrequisitos:** cuenta Expo · `npm i -g eas-cli` · `eas login` ·
`eas build:configure`.

1. **Generar dev build (Android):**
   ```bash
   eas build --profile development --platform android
   ```
   Instalar el `.apk` resultante en el teléfono.
   *Alternativa local:* `npx expo run:android` (requiere Android SDK + dispositivo).
2. **Levantar backends** (en la PC, escuchando en todas las interfaces):
   ```bash
   # Core (NestJS)
   npm run start:dev                       # puerto 3000
   # IA (FastAPI) — ejecutar SIEMPRE con el Python del venv (Keras correcto)
   .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
   ```
   Abrir el puerto 8001 en el firewall de Windows. Teléfono en la misma Wi-Fi.

   > Si arrancas con el `uvicorn` global (otro Keras), `food-scan` modo `plate`
   > falla al cargar el `.h5` (`Unrecognized keyword arguments ... renorm`).
   > Solución: usar el intérprete del venv como arriba.
3. **Arrancar Metro:** `npx expo start --dev-client` y abrir el dev build.
4. **Recorrido:**
   - Login como **paciente** → atajo **Escáner**.
   - **Plato:** permitir cámara → fotografiar un plato → ver semáforo +
     alimento + confianza.
   - **Etiqueta:** fotografiar una tabla nutricional → ver nutrientes + advertencias.
   - Probar **linterna**, **galería**, **retoma** (foto borrosa), imagen grande
     (413) y caída de red (estado de error con reintento).

---

## 10. Notas de implementación

1. **API Key en el cliente:** para un proyecto académico se embebe en
   `config.ts`. En producción debería inyectarse vía variables de entorno / EAS
   secrets, o proxyear la IA a través del Core.
2. **Alergias del paciente:** el semáforo del backend cruza alergias consultando
   al Core (`patient(id){ alergias }`). Mientras ese resolver no exista, degrada
   con perfil vacío; el semáforo sigue operando por umbrales de nutrientes y
   categorías de alimento de riesgo.
3. **Calidad del modelo de plato:** la CNN se entrenó en CPU con un subconjunto
   (~54% top-1 sobre 101 clases). Para subir exactitud, reentrenar con el dataset
   completo en GPU (WSL2). El semáforo no depende de la exactitud fina.
4. **Tamaño de imagen:** se captura con `quality: 0.7` para no exceder 5 MB.
5. **iOS:** este plan asume Android (PC Windows). Para iOS, build con EAS y
   permisos `NSCameraUsageDescription` (ya cubiertos por el plugin).
6. **Expo SDK:** el proyecto está en SDK 54 (`package.json`); consultar los docs
   de Expo de esa versión antes de tocar APIs nativas.

---

## 11. Verificación (criterios de aceptación)

- [ ] `GET /api/v1/health` reporta `food_classifier_cnn: true`.
- [ ] `food-scan` modo `label` con etiqueta real devuelve ≥ 5 nutrientes (200).
- [ ] `food-scan` modo `plate` devuelve `predicciones_alimento` con confianza.
- [ ] El teléfono abre `http://192.168.1.148:8001/api/v1/health`.
- [ ] Flujo completo plato y etiqueta muestra semáforo y datos reales en la app.
- [ ] Linterna, galería, retoma y estados de error funcionan.
