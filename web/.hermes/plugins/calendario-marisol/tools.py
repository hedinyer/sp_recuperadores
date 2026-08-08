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

    def handle_listar_tasks(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        q = ""
        if params.get("date"):
            q = f"?date={params['date']}"
        data = _request("GET", f"/api/calendario_marisol/tasks{q}")
        tasks = data.get("tasks", [])
        return _tool_result({"success": True, "count": len(tasks), "tasks": tasks})

    ctx.register_tool(
        name="skylight_listar_tasks",
        toolset=TOOLSET,
        schema={
            "name": "skylight_listar_tasks",
            "description": (
                "Lista tasks/chores visibles en el frame Skylight para una fecha "
                "(default hoy, perfil Marisol y otros)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Fecha YYYY-MM-DD (default hoy Bogotá).",
                    },
                },
                "required": [],
            },
        },
        handler=handle_listar_tasks,
        description="Listar tasks de Skylight.",
    )

    def handle_crear_task(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        body: dict[str, Any] = {"summary": params["summary"]}
        for key in ("start", "profile", "category_name", "emoji_icon", "routine", "reward_points", "start_time"):
            if params.get(key) is not None:
                body[key] = params[key]
        data = _request("POST", "/api/calendario_marisol/tasks", body)
        return _tool_result({"success": True, "task": data.get("task")})

    ctx.register_tool(
        name="skylight_crear_task",
        toolset=TOOLSET,
        schema={
            "name": "skylight_crear_task",
            "description": (
                "Crea una task visible HOY en el frame Skylight (chore asignado a un perfil). "
                "Por defecto perfil Marisol y fecha de hoy (Bogotá). "
                "NO uses task_box: eso solo guarda plantillas y no se ven en el frame."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Texto de la task (ej. Sacar basura).",
                    },
                    "start": {
                        "type": "string",
                        "description": "Fecha YYYY-MM-DD (default hoy).",
                    },
                    "profile": {
                        "type": "string",
                        "description": "Perfil: Marisol, bot, etc. Default Marisol.",
                    },
                    "emoji_icon": {"type": "string"},
                    "routine": {"type": "boolean"},
                    "reward_points": {"type": "integer"},
                },
                "required": ["summary"],
            },
        },
        handler=handle_crear_task,
        description="Crear task nativa en Skylight.",
    )

    def handle_actualizar_task(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        task_id = params["id"]
        body = {
            k: params[k]
            for k in ("summary", "emoji_icon", "routine", "reward_points")
            if k in params
        }
        if not body:
            raise RuntimeError("Indica al menos un campo a actualizar")
        data = _request("PATCH", f"/api/calendario_marisol/tasks/{task_id}", body)
        return _tool_result({"success": True, "task": data.get("task")})

    ctx.register_tool(
        name="skylight_actualizar_task",
        toolset=TOOLSET,
        schema={
            "name": "skylight_actualizar_task",
            "description": "Renombra o edita una task de Skylight por id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "ID de la task."},
                    "summary": {"type": "string", "description": "Nuevo texto."},
                    "emoji_icon": {"type": "string"},
                    "routine": {"type": "boolean"},
                    "reward_points": {"type": "integer"},
                },
                "required": ["id"],
            },
        },
        handler=handle_actualizar_task,
        description="Actualizar task de Skylight.",
    )

    def handle_borrar_task(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        task_id = params["id"]
        _request("DELETE", f"/api/calendario_marisol/tasks/{task_id}")
        return _tool_result({"success": True, "id": task_id, "deleted": True})

    ctx.register_tool(
        name="skylight_borrar_task",
        toolset=TOOLSET,
        schema={
            "name": "skylight_borrar_task",
            "description": "Elimina una task del Task Box de Skylight por id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "ID de la task a borrar."},
                },
                "required": ["id"],
            },
        },
        handler=handle_borrar_task,
        description="Borrar task de Skylight.",
    )

    def handle_listar_listas(_params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        data = _request("GET", "/api/calendario_marisol/listas")
        listas = data.get("listas", [])
        return _tool_result({"success": True, "count": len(listas), "listas": listas})

    ctx.register_tool(
        name="skylight_listar_listas",
        toolset=TOOLSET,
        schema={
            "name": "skylight_listar_listas",
            "description": "Lista las listas nativas de Skylight (compras, to-do, etc.) con su id.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
        handler=handle_listar_listas,
        description="Listar listas nativas de Skylight.",
    )

    def handle_crear_lista(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        if params.get("items"):
            body: dict[str, Any] = {"items": params["items"]}
            for key in ("list_id", "list_name", "nombre_lista", "kind"):
                if params.get(key) is not None:
                    body[key if key != "nombre_lista" else "list_name"] = params[key]
            data = _request("POST", "/api/calendario_marisol/listas", body)
            return _tool_result({"success": True, **data})
        body = {
            "label": params["label"],
            "kind": params.get("kind", "shopping"),
        }
        if params.get("color"):
            body["color"] = params["color"]
        data = _request("POST", "/api/calendario_marisol/listas", body)
        return _tool_result({"success": True, "lista": data.get("lista")})

    ctx.register_tool(
        name="skylight_crear_lista",
        toolset=TOOLSET,
        schema={
            "name": "skylight_crear_lista",
            "description": (
                "Crea una lista nativa en Skylight o agrega ítems a una existente. "
                "kind: shopping (compras) o to_do (pendientes). "
                "Si pasas items, los agrega a la lista indicada (o a Grocery List por defecto)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "label": {
                        "type": "string",
                        "description": "Nombre de lista nueva (solo al crear).",
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["shopping", "to_do"],
                        "description": "Tipo: shopping=compras, to_do=pendientes.",
                    },
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Ítems a agregar (ej. leche, pan).",
                    },
                    "list_id": {"type": "string", "description": "ID de lista existente."},
                    "list_name": {
                        "type": "string",
                        "description": "Nombre parcial de lista existente (ej. Grocery).",
                    },
                    "nombre_lista": {
                        "type": "string",
                        "description": "Alias de list_name.",
                    },
                    "color": {"type": "string", "description": "Color hex al crear lista."},
                },
                "required": [],
            },
        },
        handler=handle_crear_lista,
        description="Crear lista nativa o agregar ítems en Skylight.",
    )

    def handle_listar_items_lista(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        list_id = params.get("list_id")
        if not list_id:
            listas = _request("GET", "/api/calendario_marisol/listas").get("listas", [])
            name = (params.get("list_name") or params.get("nombre_lista") or "").lower()
            kind = params.get("kind") or "shopping"
            for lista in listas:
                if name and name in str(lista.get("label", "")).lower():
                    list_id = lista["id"]
                    break
            if not list_id:
                for lista in listas:
                    if lista.get("kind") == kind:
                        list_id = lista["id"]
                        break
        if not list_id:
            raise RuntimeError("list_id o list_name/kind requerido")
        data = _request("GET", f"/api/calendario_marisol/listas/{list_id}")
        return _tool_result({"success": True, **data})

    ctx.register_tool(
        name="skylight_listar_items_lista",
        toolset=TOOLSET,
        schema={
            "name": "skylight_listar_items_lista",
            "description": "Lista los ítems de una lista de Skylight.",
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {"type": "string"},
                    "list_name": {"type": "string", "description": "Ej. Grocery List"},
                    "kind": {"type": "string", "enum": ["shopping", "to_do"]},
                },
                "required": [],
            },
        },
        handler=handle_listar_items_lista,
        description="Listar ítems de una lista Skylight.",
    )

    def handle_completar_item_lista(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        list_id = params["list_id"]
        item_id = params["item_id"]
        completed = params.get("completed", True)
        data = _request(
            "PATCH",
            f"/api/calendario_marisol/listas/{list_id}/items/{item_id}",
            {"completed": completed},
        )
        return _tool_result({"success": True, "item": data.get("item")})

    ctx.register_tool(
        name="skylight_completar_item_lista",
        toolset=TOOLSET,
        schema={
            "name": "skylight_completar_item_lista",
            "description": "Marca un ítem de lista como hecho o pendiente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {"type": "string"},
                    "item_id": {"type": "string"},
                    "completed": {"type": "boolean", "description": "true=hecho, false=pendiente"},
                },
                "required": ["list_id", "item_id"],
            },
        },
        handler=handle_completar_item_lista,
        description="Completar ítem de lista Skylight.",
    )

    def handle_borrar_item_lista(params: dict[str, Any], **_kwargs) -> str:
        del _kwargs
        list_id = params["list_id"]
        item_id = params["item_id"]
        _request("DELETE", f"/api/calendario_marisol/listas/{list_id}/items/{item_id}")
        return _tool_result({"success": True, "list_id": list_id, "item_id": item_id, "deleted": True})

    ctx.register_tool(
        name="skylight_borrar_item_lista",
        toolset=TOOLSET,
        schema={
            "name": "skylight_borrar_item_lista",
            "description": "Elimina un ítem de una lista de Skylight.",
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {"type": "string"},
                    "item_id": {"type": "string"},
                },
                "required": ["list_id", "item_id"],
            },
        },
        handler=handle_borrar_item_lista,
        description="Borrar ítem de lista Skylight.",
    )
