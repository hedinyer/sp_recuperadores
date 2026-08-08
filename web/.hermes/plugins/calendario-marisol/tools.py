"""Tools Hermes → API Calendario Marisol."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE = "https://sp-recuperadores.vercel.app"
TOOLSET = "calendario_marisol"


def _base_url() -> str:
    return os.environ.get("CALENDARIO_MARISOL_BASE_URL", DEFAULT_BASE).rstrip("/")


def _token() -> str:
    token = os.environ.get("CALENDARIO_MARISOL_TOKEN", "").strip()
    if not token:
        raise RuntimeError("CALENDARIO_MARISOL_TOKEN no configurado")
    return token


def _request(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
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
        with urllib.request.urlopen(req, timeout=30) as resp:
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
    """Registra tools de calendario para Hermes Agent."""

    def handle_listar(_params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        data = _request("GET", "/api/calendario_marisol/eventos")
        eventos = data.get("eventos", [])
        return _tool_result({"success": True, "count": len(eventos), "eventos": eventos})

    ctx.register_tool(
        name="calendario_listar_eventos",
        toolset=TOOLSET,
        schema={
            "name": "calendario_listar_eventos",
            "description": (
                "Lista todos los eventos del Calendario Marisol (Skylight). "
                "Usar antes de editar o borrar para obtener el id."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        handler=handle_listar,
        description="Listar eventos del calendario Marisol.",
    )

    def handle_crear(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        body = {
            "summary": params["summary"],
            "description": params.get("description", ""),
            "dtstart": params["dtstart"],
            "dtend": params["dtend"],
        }
        data = _request("POST", "/api/calendario_marisol/eventos", body)
        return _tool_result({"success": True, "evento": data.get("evento")})

    ctx.register_tool(
        name="calendario_crear_evento",
        toolset=TOOLSET,
        schema={
            "name": "calendario_crear_evento",
            "description": (
                "Crea un evento en el Calendario Marisol. Aparece en Skylight vía feed ICS. "
                "Fechas en ISO 8601 (ej. 2026-08-08T15:00:00-05:00). Zona horaria Colombia: -05:00."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Título del evento (ej. Dentista, Cumpleaños).",
                    },
                    "description": {
                        "type": "string",
                        "description": "Notas opcionales.",
                    },
                    "dtstart": {
                        "type": "string",
                        "description": "Inicio ISO 8601 con zona horaria.",
                    },
                    "dtend": {
                        "type": "string",
                        "description": "Fin ISO 8601 con zona horaria (>= dtstart).",
                    },
                },
                "required": ["summary", "dtstart", "dtend"],
            },
        },
        handler=handle_crear,
        description="Crear evento en Calendario Marisol.",
    )

    def handle_actualizar(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        evento_id = params["id"]
        body = {k: params[k] for k in ("summary", "description", "dtstart", "dtend") if k in params}
        if not body:
            raise RuntimeError("Indica al menos un campo a actualizar")
        data = _request("PATCH", f"/api/calendario_marisol/eventos/{evento_id}", body)
        return _tool_result({"success": True, "evento": data.get("evento")})

    ctx.register_tool(
        name="calendario_actualizar_evento",
        toolset=TOOLSET,
        schema={
            "name": "calendario_actualizar_evento",
            "description": "Actualiza un evento existente por id (obtener id con calendario_listar_eventos).",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "UUID del evento."},
                    "summary": {"type": "string", "description": "Nuevo título."},
                    "description": {"type": "string", "description": "Nueva descripción."},
                    "dtstart": {"type": "string", "description": "Nuevo inicio ISO 8601."},
                    "dtend": {"type": "string", "description": "Nuevo fin ISO 8601."},
                },
                "required": ["id"],
            },
        },
        handler=handle_actualizar,
        description="Actualizar evento del calendario.",
    )

    def handle_borrar(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        evento_id = params["id"]
        _request("DELETE", f"/api/calendario_marisol/eventos/{evento_id}")
        return _tool_result({"success": True, "id": evento_id, "deleted": True})

    ctx.register_tool(
        name="calendario_borrar_evento",
        toolset=TOOLSET,
        schema={
            "name": "calendario_borrar_evento",
            "description": "Elimina un evento del calendario por id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "UUID del evento a borrar."},
                },
                "required": ["id"],
            },
        },
        handler=handle_borrar,
        description="Borrar evento del calendario.",
    )

    def handle_crear_lista_evento(params: dict[str, Any], **_kwargs) -> str:
        """Lista de compras/tareas como evento de día completo (visible en Skylight)."""
        del _kwargs
        nombre = params["nombre_lista"]
        items = params.get("items") or []
        if isinstance(items, str):
            items = [s.strip() for s in items.split(",") if s.strip()]
        fecha = params.get("fecha") or params.get("dtstart")
        if not fecha:
            raise RuntimeError("fecha requerida (YYYY-MM-DD o ISO)")
        # Día completo en Bogotá → evento 00:00–23:59 local
        if len(fecha) == 10:
            dtstart = f"{fecha}T00:00:00-05:00"
            dtend = f"{fecha}T23:59:00-05:00"
        else:
            dtstart = fecha
            dtend = params.get("dtend") or dtstart
        lines = "\n".join(f"• {item}" for item in items) if items else ""
        body = {
            "summary": f"📋 {nombre}",
            "description": lines,
            "dtstart": dtstart,
            "dtend": dtend,
        }
        data = _request("POST", "/api/calendario_marisol/eventos", body)
        return _tool_result(
            {
                "success": True,
                "evento": data.get("evento"),
                "nota": "Lista publicada como evento de día completo; Skylight la muestra en el calendario.",
            }
        )

    ctx.register_tool(
        name="calendario_crear_lista",
        toolset=TOOLSET,
        schema={
            "name": "calendario_crear_lista",
            "description": (
                "Publica una lista (compras, tareas) como evento de día completo en Skylight. "
                "Skylight no tiene API de listas nativas vía ICS; esto la muestra en el calendario."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "nombre_lista": {
                        "type": "string",
                        "description": "Nombre de la lista (ej. Compras, Pendientes).",
                    },
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ítems de la lista.",
                    },
                    "fecha": {
                        "type": "string",
                        "description": "Fecha YYYY-MM-DD o ISO de inicio.",
                    },
                },
                "required": ["nombre_lista", "items", "fecha"],
            },
        },
        handler=handle_crear_lista_evento,
        description="Crear lista visible en Skylight como evento.",
    )
