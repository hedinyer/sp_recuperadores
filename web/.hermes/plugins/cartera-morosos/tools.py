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
                "Categorías: bajo_pago, sin_gps, mora_15, mora_4_15. "
                "No incluye GPS; sirve para decidir a quién llamar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "categoria": {
                        "type": "string",
                        "enum": ["bajo_pago", "sin_gps", "mora_15", "mora_4_15"],
                        "description": "Filtrar por bandeja.",
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
                "perfil_id: jhon_saenz | dayana | santiago_saenz | angie_garcia | mauricio_perucho."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "placa": {"type": "string", "description": "Placa."},
                    "perfil_id": {
                        "type": "string",
                        "description": "Quién gestiona (ej. dayana, jhon_saenz).",
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
                        "description": "Bandeja opcional (bajo_pago, sin_gps, …).",
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
                "recaudo por Dayana y Jhon Sáenz."
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
