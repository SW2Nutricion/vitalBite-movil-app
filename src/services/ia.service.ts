/**
 * Cliente del microservicio de IA (FastAPI, REST) — Escáner Nutricional (CU9).
 *
 * A diferencia del resto de servicios (GraphQL/Apollo contra el Core), este usa
 * `fetch` con `multipart/form-data` porque el backend de IA expone REST para la
 * inferencia. La imagen capturada por la cámara se sube por su `uri` local.
 *
 * Tipos espejo de `FoodScanResponse` del backend
 * (`vitalBite-backend-ia/app/schemas/food_scan.py`).
 */

import { IA_FOOD_SCAN_URL, IA_HEALTH_URL, IA_IMAGE_MAX_BYTES } from '../constants/config';

export type ScanMode = 'label' | 'plate';

export type Semaforo = 'SEGURO' | 'PRECAUCION' | 'RIESGO';

export interface NutrientInfo {
  calorias: number | null;
  carbohidratos_g: number | null;
  proteinas_g: number | null;
  grasas_totales_g: number | null;
  grasas_saturadas_g: number | null;
  sodio_mg: number | null;
  azucares_g: number | null;
  fibra_g: number | null;
  ingredientes: string[];
}

export interface FoodPrediction {
  clase: string;
  probabilidad: number;
}

export interface FoodScanResult {
  modo: ScanMode;
  semaforo: Semaforo;
  advertencias: string[];
  nutrientes: NutrientInfo;
  predicciones_alimento: FoodPrediction[];
  confianza: number;
  requiere_retoma: boolean;
  mensaje_retoma: string | null;
}

/** Error de dominio con mensaje listo para mostrar al usuario. */
export class IaServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'IaServiceError';
  }
}

interface ScanFoodArgs {
  imageUri: string;
  mode: ScanMode;
  patientId: string;
}

function inferImageMeta(uri: string): { name: string; type: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return { name: 'scan.png', type: 'image/png' };
  if (lower.endsWith('.webp')) return { name: 'scan.webp', type: 'image/webp' };
  return { name: 'scan.jpg', type: 'image/jpeg' };
}

function mapHttpError(status: number, body: unknown): IaServiceError {
  // El backend devuelve { detail: ... } o { error, message, ... }
  const detail =
    body && typeof body === 'object'
      ? ((body as any).detail ?? body)
      : body;
  const message =
    detail && typeof detail === 'object'
      ? ((detail as any).message ?? (detail as any).error ?? JSON.stringify(detail))
      : String(detail ?? '');
  const code = detail && typeof detail === 'object' ? (detail as any).error : undefined;

  switch (status) {
    case 401:
    case 403:
      return new IaServiceError('No autorizado para usar el escáner.', status, code);
    case 413:
      return new IaServiceError(
        'La imagen es demasiado grande (máx. 5 MB). Toma otra foto.',
        status,
        code,
      );
    case 422:
      return new IaServiceError(
        message || 'No se pudo procesar la imagen. Verifica el formato.',
        status,
        code,
      );
    case 503:
      return new IaServiceError(
        message ||
          'El modelo de análisis no está disponible en este momento. Intenta más tarde.',
        status,
        code,
      );
    default:
      return new IaServiceError(
        message || `Error del servicio de IA (HTTP ${status}).`,
        status,
        code,
      );
  }
}

/**
 * Envía una imagen al endpoint `food-scan` y devuelve el análisis nutricional.
 * @throws {IaServiceError} con un mensaje en español listo para la UI.
 */
export async function scanFood({
  imageUri,
  mode,
  patientId,
}: ScanFoodArgs): Promise<FoodScanResult> {
  const meta = inferImageMeta(imageUri);

  const form = new FormData();
  form.append('patient_id', patientId);
  form.append('mode', mode);
  // En React Native el File se representa como { uri, name, type }
  form.append('image', { uri: imageUri, name: meta.name, type: meta.type } as any);

  let response: Response;
  try {
    response = await fetch(IA_FOOD_SCAN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // No fijar Content-Type: fetch añade el boundary del multipart.
      },
      body: form,
    });
  } catch (e) {
    throw new IaServiceError(
      'No se pudo conectar con el servidor de IA. Verifica tu conexión y que el backend esté activo.',
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw mapHttpError(response.status, body);
  }

  return body as FoodScanResult;
}

export interface IaHealth {
  status: string;
  service: string;
  version: string;
  modelos: Record<string, boolean>;
  modelos_cargados: boolean;
}

/** Consulta el estado de salud del backend de IA (modelos cargados). */
export async function checkIaHealth(): Promise<IaHealth> {
  try {
    const res = await fetch(IA_HEALTH_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new IaServiceError(`Health HTTP ${res.status}`, res.status);
    return (await res.json()) as IaHealth;
  } catch (e) {
    if (e instanceof IaServiceError) throw e;
    throw new IaServiceError('No se pudo contactar al servicio de IA a través del gateway.');
  }
}

export { IA_IMAGE_MAX_BYTES };
