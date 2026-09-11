"""Tools Hermes → API cartera (morosos / gestiones / KPIs)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE = "https://sp-recuperadores.vercel.app"
TOOLSET = "cartera_morosos"

# ponytail: mismo Bearer que calendario si no hay CARTERA_HERMES_TOKEN
_FALLBACK_TOKEN = "15c903ed719abb5f3eb16e102300a0ed692fe8305319c293"


def _base_url() -> str:
    return os.environ.get("CARTERA_HERMES_BASE_URL", DEFAULT_BASE).rstrip("/")


def _token() -> str:
    token = (
        os.environ.get("CARTERA_HERMES_TOKEN", "").strip()
        or os.environ.get("CALENDARIO_MARISOL_TOKEN", "").strip()
        or _FALLBACK_TOKEN
    )
    if not token:
        raise RuntimeError("CARTERA_HERMES_TOKEN no configurado")
    return token


def _request(
    method: str, path: str, body: dict[str, Any] | None = None
) -> dict[str, Any]:
    url = f"{_base_url()}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {_token()}",
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            msg = parsed.get("error") or detail
        except json.JSONDecodeError:
            msg = detail or e.reason
        raise RuntimeError(f"HTTP {e.code}: {msg}") from e


def _tool_result(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def register_tools(ctx) -> None:
    """Registra tools de cartera para Hermes Agent."""

    def handle_buscar(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        q = str(params.get("q") or "").strip()
        if not q:
            raise RuntimeError("q requerido (placa, nombre o teléfono)")
        qs = urllib.parse.urlencode({"action": "buscar", "q": q})
        data = _request("GET", f"/api/cartera/agent?{qs}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_buscar",
        toolset=TOOLSET,
        schema={
            "name": "cartera_buscar",
            "description": (
                "Busca un cliente moroso por placa (ej. ABC12D), nombre o teléfono. "
                "Devuelve ficha (deuda, mora, tel) + caso actual + últimas gestiones. "
                "Usar antes de registrar una gestión."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "q": {
                        "type": "string",
                        "description": "Placa, nombre o teléfono del cliente.",
                    },
                },
                "required": ["q"],
            },
        },
        handler=handle_buscar,
        description="Buscar moroso por placa, nombre o teléfono.",
    )

    def handle_historial(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        placa = str(params.get("placa") or "").strip()
        if not placa:
            raise RuntimeError("placa requerida")
        qs = urllib.parse.urlencode({"action": "historial", "placa": placa})
        data = _request("GET", f"/api/cartera/agent?{qs}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_historial",
        toolset=TOOLSET,
        schema={
            "name": "cartera_historial",
            "description": (
                "Lista el historial de gestiones de una placa (qué se le dijo, "
                "compromisos, abonos). Útil antes de decidir el siguiente paso."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "placa": {
                        "type": "string",
                        "description": "Placa del vehículo.",
                    },
                },
                "required": ["placa"],
            },
        },
        handler=handle_historial,
        description="Historial de gestiones de una placa.",
    )

    def handle_pendientes(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        query: dict[str, str] = {"action": "pendientes"}
        if params.get("categoria"):
            query["categoria"] = str(params["categoria"])
        if params.get("limit") is not None:
            query["limit"] = str(params["limit"])
        qs = urllib.parse.urlencode(query)
        data = _request("GET", f"/api/cartera/agent?{qs}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_pendientes",
        toolset=TOOLSET,
        schema={
            "name": "cartera_pendientes",
            "description": (
                "Lista morosos pendientes para gestionar ahora (máx 20). "
                "Categorías: cuotas_1_5, cuotas_6_10, cuotas_11_16, cuotas_17. "
                "No incluye GPS; sirve para decidir a quién llamar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {
                        "type": "string",
                        "enum": [
                            "cuotas_1_5",
                            "cuotas_6_10",
                            "cuotas_11_16",
                            "cuotas_17",
                        ],
                        "description": "Filtrar por bandeja de cuotas pendientes.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Cuántos devolver (1–20, default 10).",
                    },
                },
                "required": [],
            },
        },
        handler=handle_pendientes,
        description="Cola de morosos pendientes por bandeja.",
    )

    def handle_registrar(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        body: dict[str, Any] = {
            "action": "registrar",
            "placa": params["placa"],
            "perfil_id": params["perfil_id"],
            "status": params["status"],
        }
        if params.get("notas") is not None:
            body["notas"] = params["notas"]
        if params.get("categoria") is not None:
            body["categoria"] = params["categoria"]
        if params.get("monto") is not None:
            body["monto"] = params["monto"]
        data = _request("POST", "/api/cartera/agent", body)
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_registrar",
        toolset=TOOLSET,
        schema={
            "name": "cartera_registrar",
            "description": (
                "Registra una gestión de cobro en Supabase. "
                "El cobrador (humano) pega lo que dijo el cliente en notas; "
                "NO envíes WhatsApp ni inventes mensajes al cliente. "
                "Estados: pendiente, contactado, compromiso, abono, no_contesta, "
                "visita, en_ruta, recuperada, cerrado. "
                "Si status=abono, monto es obligatorio (COP). "
                "perfil_id: jhon_saenz | james_blanco | santiago_saenz | angie_garcia | mauricio_perucho."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "placa": {"type": "string", "description": "Placa."},
                    "perfil_id": {
                        "type": "string",
                        "description": "Quién gestiona (ej. james_blanco, jhon_saenz).",
                    },
                    "status": {
                        "type": "string",
                        "description": "Estado de la gestión.",
                        "enum": [
                            "pendiente",
                            "contactado",
                            "compromiso",
                            "abono",
                            "no_contesta",
                            "visita",
                            "en_ruta",
                            "recuperada",
                            "cerrado",
                        ],
                    },
                    "notas": {
                        "type": "string",
                        "description": (
                            "Texto que pegó el cobrador (chat del cliente, "
                            "compromiso, captura). Hasta 4000 chars."
                        ),
                    },
                    "monto": {
                        "type": "number",
                        "description": "Valor del pago en COP (obligatorio si abono).",
                    },
                    "categoria": {
                        "type": "string",
                        "description": "Bandeja opcional (cuotas_1_5, cuotas_6_10, …).",
                    },
                },
                "required": ["placa", "perfil_id", "status"],
            },
        },
        handler=handle_registrar,
        description="Registrar gestión o pago de cartera.",
    )

    def handle_kpis(_params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        data = _request("GET", "/api/cartera/agent?action=kpis")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_kpis",
        toolset=TOOLSET,
        schema={
            "name": "cartera_kpis",
            "description": (
                "KPIs de cobro de hoy (Bogotá): motos gestionadas, estados y "
                "recaudo por James Blanco y Jhon Sáenz."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        handler=handle_kpis,
        description="KPIs de cobro de hoy.",
    )

    def handle_efectividad(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        path = "/api/cartera/efectividad"
        placa = str(params.get("placa") or "").strip()
        if placa:
            path = f"{path}?placa={urllib.parse.quote(placa)}"
        data = _request("GET", path)
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_efectividad",
        toolset=TOOLSET,
        schema={
            "name": "cartera_efectividad",
            "description": (
                "Efectividad de cobro: días y gestiones hasta el pago (abono o ERP), "
                "ranking de métodos (WhatsApp/visita/compromiso…) y sugerencia del "
                "siguiente método por cliente. Opcional filtrar por placa."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "placa": {
                        "type": "string",
                        "description": "Placa opcional para un solo cliente.",
                    },
                },
                "required": [],
            },
        },
        handler=handle_efectividad,
        description="Efectividad cobro y ranking de métodos.",
    )

    def handle_alertas(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        perfil = str(params.get("perfil_id") or "").strip()
        if not perfil:
            raise RuntimeError("perfil_id requerido (jhon_saenz | james_blanco)")
        qs = urllib.parse.urlencode(
            {
                "action": "alertas",
                "perfil_id": perfil,
                "unread": "1" if params.get("solo_no_leidas") else "0",
            }
        )
        data = _request("GET", f"/api/cartera/agent?{qs}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_alertas",
        toolset=TOOLSET,
        schema={
            "name": "cartera_alertas",
            "description": (
                "Lista alertas IA del cobrador (compromisos próximos/vencidos, "
                "ruptura de promesa, prioridad). perfil_id: jhon_saenz | james_blanco."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "perfil_id": {
                        "type": "string",
                        "description": "jhon_saenz o james_blanco",
                    },
                    "solo_no_leidas": {
                        "type": "boolean",
                        "description": "Si true, solo alertas sin leer.",
                    },
                },
                "required": ["perfil_id"],
            },
        },
        handler=handle_alertas,
        description="Alertas IA del cobrador.",
    )

    def handle_analizar(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        perfil = str(params.get("perfil_id") or "").strip()
        if not perfil:
            raise RuntimeError("perfil_id requerido")
        body: dict[str, Any] = {
            "action": "analizar",
            "perfil_id": perfil,
        }
        if params.get("force"):
            body["force"] = True
        data = _request("POST", "/api/cartera/agent", body)
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_analizar",
        toolset=TOOLSET,
        schema={
            "name": "cartera_analizar",
            "description": (
                "Dispara el harness multi-agente: analiza gestiones nuevas del lote "
                "17+ (notas + botones + pagos), crea follow-ups y alertas. "
                "Solo jhon_saenz / james_blanco."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "perfil_id": {
                        "type": "string",
                        "description": "jhon_saenz o james_blanco",
                    },
                    "force": {
                        "type": "boolean",
                        "description": "Reanalizar aunque ya estén analizadas.",
                    },
                },
                "required": ["perfil_id"],
            },
        },
        handler=handle_analizar,
        description="Analizar gestiones nuevas del lote.",
    )

    def handle_followups(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        perfil = str(params.get("perfil_id") or "").strip()
        if not perfil:
            raise RuntimeError("perfil_id requerido")
        qs = urllib.parse.urlencode(
            {"action": "followups", "perfil_id": perfil}
        )
        data = _request("GET", f"/api/cartera/agent?{qs}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="cartera_followups",
        toolset=TOOLSET,
        schema={
            "name": "cartera_followups",
            "description": (
                "Compromisos/follow-ups pendientes del cobrador en las próximas 72h "
                "(fechas extraídas de notas como «paga mañana» o «el sábado»)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "perfil_id": {
                        "type": "string",
                        "description": "jhon_saenz o james_blanco",
                    },
                },
                "required": ["perfil_id"],
            },
        },
        handler=handle_followups,
        description="Follow-ups de compromiso próximos.",
    )
