import asyncio
from findmy import FindMyClient

async def obtener_coordenadas():
    # Inicia sesión con tus credenciales de iCloud
    client = FindMyClient()
    await client.login("tu_usuario@icloud.com", "tu_contraseña")

    # Trae todos los rastreadores OTAG / AirTag vinculados
    dispositivos = await client.get_all_devices()
    for disp in dispositivos:
        print(f"Dispositivo: {disp.name}")
        print(f"Latitud: {disp.location.latitude}")
        print(f"Longitud: {disp.location.longitude}")

asyncio.run(obtener_coordenadas())