"""Plugin Hermes: cobro de cartera (API REST + Supabase)."""

from .tools import register_tools


def register(ctx):
    register_tools(ctx)
