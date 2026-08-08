"""Plugin Hermes: Calendario Marisol (API REST + Skylight ICS)."""

from .tools import register_tools


def register(ctx):
    register_tools(ctx)
