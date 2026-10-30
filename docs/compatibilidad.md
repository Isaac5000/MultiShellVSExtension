# Compatibilidad con conectores MCP antiguos

Esta capa se introdujo en la versión 0.7.1 y sigue presente en **0.10.10**. Permite utilizar esquemas de herramientas antiguos que aún no exponen `shell_id` explícitamente; el servidor **exige seleccionar la terminal** y nunca deduce la conversación de ChatGPT que llama.

## Descubrir ventanas y terminales

Mediante `execute_shell_command_code`, con `cwd="@mcp"`, los comandos de control internos son:

- `command="windows"`: mostrar las ventanas registradas.
- `command="shells"`: listar las terminales disponibles.
- `command="help"`: mostrar ayuda sobre los selectores.

Estos tres comandos no se ejecutan en una terminal del sistema.

## Ejecutar comandos

```text
execute_shell_command_code(command="git status", cwd="@shell:main-fallout-a1b2c3d4")
```

El identificador es ilustrativo: copia el ID o alias real desde el panel. También funcionan alias cortos (`cwd="@shell:1"`). Cada shell mantiene su propia cola FIFO; shells distintos pueden ejecutar en paralelo.

## Operaciones con archivos

Anteponiendo `@shell:<id>/` a la ruta relativa:

```text
read_file_code(path="@shell:main-fallout-a1b2c3d4/src/main.ts")
```

En `copy_file_code` y `move_file_code`, ambas rutas deben seleccionar **el mismo shell**. Sin selector, con un shell diferente o fuera de su ámbito, la petición se rechaza.

Las herramientas de diagnósticos, símbolos, definiciones y consultas nativas de VSCode volvieron a estar disponibles desde **0.10.0** con aislamiento por ventana; no están deshabilitadas como ocurría en las primeras versiones.

## Limitaciones y seguridad

El puerto público predeterminado es `127.0.0.1:3000` (configurable). El túnel externo se configura de forma independiente. Los alias evitan confusiones de destino, **pero no autentican a cada conversación**. Los procesos ejecutados en terminales no son contenedores y actúan con los permisos del usuario. Para ediciones en paralelo del mismo repositorio, utiliza directorios separados o Git worktrees.

Para instalar la extensión consulta [Instalación](instalacion.md); para el panel y el comportamiento de las terminales, [Guía de uso](uso.md).
