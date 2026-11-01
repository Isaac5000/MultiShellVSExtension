# Compatibilidad con conectores MCP

[English](../en/compatibility.md) · [Índice](../../README.md)

MultiShell MCP 0.10.25 mantiene una capa de compatibilidad para conectores antiguos que no exponen `shell_id` como parámetro. **Incluso con esa capa, toda operación debe seleccionar una terminal**: no existe una terminal activa global y la extensión no puede identificar por sí misma la conversación de ChatGPT que envía la llamada.

## Herramientas actuales

Cuando el cliente MCP tiene actualizado su esquema, se utilizan las herramientas con parámetros explícitos:

| Herramienta | Función |
| --- | --- |
| `list_windows_code` | Mostrar `window_id` y proyectos conectados |
| `list_shells_code` | Mostrar IDs, alias y estado de las terminales |
| `create_shell_code` | Crear una terminal **temporal MCP**, sin persistencia de usuario |
| `create_user_shell_code` | Solicitar una terminal **de usuario**, con aprobación local obligatoria en **Solicitudes** |
| `execute_shell_command_code` | Ejecutar un comando en el `shell_id` seleccionado |
| `set_shell_alias_code` | Asignar o cambiar un alias |
| `close_shell_code` | Cerrar una terminal; si es de usuario, requiere confirmación local |

Las herramientas de lectura y edición de archivos trabajan dentro del directorio autorizado para la terminal seleccionada. Diagnósticos, símbolos y otras operaciones nativas de VS Code se ejecutan en la ventana propietaria.

### Solicitar una terminal persistente

`create_user_shell_code` **no concede permiso a la IA por sí misma**: añade una petición a **Solicitudes** de la ventana propietaria, donde se muestran ID, directorio y si comparte carpeta. Si se rechaza o cancela, no se crea.

`create_shell_code` no puede elevarse a terminal de usuario mediante campos adicionales. El cierre de una terminal de usuario también necesita aprobación local. La guía completa está en [Uso](uso.md).

## Conector heredado: `@mcp` y `@shell`

El comando `execute_shell_command_code` puede utilizar `cwd="@mcp"` para **consultas de control que no ejecutan una shell**:

```text
execute_shell_command_code(command="windows", cwd="@mcp")
execute_shell_command_code(command="shells", cwd="@mcp")
execute_shell_command_code(command="help", cwd="@mcp")
```

Para ejecutar un comando se debe seleccionar el shell por ID o alias:

```text
execute_shell_command_code(command="git status", cwd="@shell:mi_proyecto")
```

El alias `mi_proyecto` es ilustrativo: cópialo del panel o de la lista devuelta por `shells`. Dos terminales diferentes pueden ejecutar en paralelo; una terminal individual mantiene su cola FIFO.

### Lectura y edición de archivos

Las rutas relativas en herramientas de archivos se prefijan con `@shell:<id>/`:

```text
read_file_code(path="@shell:mi_proyecto/src/main.ts")
```

Las operaciones de copia y movimiento requieren que **ambos extremos pertenezcan al mismo shell**. Una ruta fuera del ámbito permitido o sin selector válido se rechaza.

La capa heredada está pensada para **consultas y operaciones sobre shells existentes**. Para utilizar una herramienta nueva como `create_user_shell_code`, el conector debe descubrir su esquema actual. Si todavía no aparece, actualiza o reconecta el conector tras instalar el VSIX; no cambies las claves o el perfil del túnel para resolver un esquema en caché.

## Seguridad y túnel

La API MCP externa al proceso de VS Code escucha por defecto en `127.0.0.1:3000/mcp`. El túnel se gestiona aparte: la extensión conserva su contrato local sin OAuth propia ni encabezados nuevos para Tunnel Client 0.0.18. Los selectores y alias **no autentican chats** y los comandos se ejecutan con permisos reales del usuario. No expongas el endpoint local a Internet sin una capa de control de acceso.

Consulta [Instalación](instalacion.md) para actualizar y [Validación](validacion.md) para probar la conexión.

## Autorizaciones y programas interactivos (0.10.19)

`create_user_shell_code` incorpora una solicitud a la bandeja **Solicitudes** de la ventana propietaria, no una autorización directa. Solo el panel puede aceptar o rechazarla. La herramienta pública MCP y el endpoint de control no ofrecen ninguna operación para aprobar solicitudes. Las solicitudes caducadas o desconectadas no crean terminales.

La opción global `multi-shell-mcp.interactiveAutoExit` tiene valor predeterminado `true`. El panel permite una preferencia por ventana y otra específica por terminal. La salida automática solo intenta `q` para programas interactivos reconocidos y comandos simples; nunca garantiza la detección universal de entrada interactiva.