# Integración con Agent Skills

[English](../en/skills.md) · [Índice](../../README.md)

**MultiShell MCP Server 0.10.72** admite skills de proyecto basadas en la especificación Agent Skills, con `SKILL.md` y metadatos YAML (`name` y `description`).

## Mejoras de rendimiento de skills (0.10.54)

Los índices reutilizan metadatos y hashes SHA-256 únicamente cuando coinciden identidad y marcas temporales de los archivos. Nuevas skills, cambios y eliminaciones se verifican en cada consulta, sin TTL de caché externa. Los permisos por ventana/IA, la protección frente a rutas externas y enlaces simbólicos, y los límites de lectura permanecen activos.

Las respuestas de las herramientas de skills utilizan JSON compacto. Las referencias de texto usan UTF-8 directo en `resources/read`, evitando Base64 intermedio; los recursos binarios conservan Base64. Los límites de caché son 4096 rutas, 2048 metadatos/8 MiB y 8192 hashes.

En una prueba sintética local de 180 skills y 360 archivos, nueve páginas nativas bajaron de ~6,99 s a ~0,87 s con caché caliente (~1,28 s en la primera pasada). No es una garantía para otros proyectos o equipos.
## Dónde guardar las skills

En el panel **MultiShell MCP → Skills** encontrarás un navegador del proyecto de esa ventana. **La ruta se muestra siempre debajo del nombre** (si es larga, se abrevia visualmente y se puede consultar completa al pasar el cursor). El icono de copiar queda a la derecha del nombre. Solo la **descripción** está plegada por defecto: pulsa «Descripción» para expandirla. Los detalles abiertos se conservan al cargar más skills y se restablecen al cambiar de ventana o proyecto. Busca por nombre o descripción, elige proyecto o personales y pulsa **Mostrar más skills** para continuar (40 por página). **Copiar para ChatGPT** copia una instrucción con `load_skill_code`, la ruta exacta y el identificador completo de la terminal principal: pégala en un chat conectado a MultiShell MCP. Los nombres duplicados conservan sus rutas para poder elegirlos sin ambigüedad.

El catálogo local también puede consultarse con el servidor detenido; para copiar la instrucción hay que iniciarlo. **Volver a detectar skills** actualiza la lista después de instalar o modificar skills. La lectura requiere un proyecto de confianza y permisos de archivos. Las skills personales respetan el ajuste de acceso global; el botón de configuración abre sus opciones y no concede el permiso automáticamente. Los directorios internos de plugins como ECC no se añaden automáticamente: coloca las skills que quieras compartir en una de las fuentes admitidas. Si tu conector conserva un esquema antiguo, actualiza su lista de herramientas para disponer de `load_skill_code`.

Dentro de la carpeta de trabajo de la terminal seleccionada:

```text
mi-proyecto/
└── .agents/
    └── skills/
        └── revisar-codigo/
            ├── SKILL.md
            ├── references/
            │   └── normas.md
            ├── scripts/
            │   └── validar.py
            └── assets/
```

También se detectan `.github/skills/` y `.claude/skills/`, sin duplicar archivos. El nombre de la carpeta debe coincidir con `name` en el encabezado YAML.

```yaml
---
name: revisar-codigo
description: Revisar cambios de código y ejecutar comprobaciones cuando se solicite una auditoría del proyecto.
---

Lee references/normas.md y revisa los cambios antes de recomendar correcciones.
```

### Selector rápido de VS Code

Desde **Ctrl+Mayús+P → MultiShell MCP: Mostrar skills disponibles** puedes localizar una skill sin recordar su ruta. El selector de la versión 0.10.37 recorre todas las páginas (no solo las primeras 100), enseña el propósito de cada skill y copia su **nombre** si es único, o su **`skill_path`** cuando hay nombres repetidos. No examina carpetas del proceso de VS Code cuando no existe un proyecto abierto; se necesita una carpeta de confianza.

La búsqueda `list_skill_names_code` filtra por **nombre antes de aplicar la paginación**. Para encontrar workflows por su descripción, usa `find_skills_code`, que conserva las coincidencias por texto de descripción.

## Cómo utilizar las skills con MCP

1. Consulta `list_shells_code` y selecciona el `shell_id` del proyecto.
2. Llama a `list_skills_code` con ese `shell_id`. Recibirás nombres, descripciones y rutas `skill_path`.
3. Utiliza `read_skill_code` con el `shell_id` y el `skill_path` exacto para obtener el `SKILL.md`.
4. Cuando una skill necesite documentación, plantillas o scripts auxiliares, utiliza `read_skill_file_code` con una ruta relativa al directorio de esa skill. Los archivos binarios admiten lectura en base64.

También se exponen recursos MCP de solo lectura: `skill://index.json` para descubrir skills de ventanas conectadas y URIs `skill://workspace/...` para acceder a sus ficheros. Este índice es compatible con clientes que implementan ese mecanismo de descubrimiento; no todos los clientes lo admiten.

El contenido se descubre en el momento de la consulta, por lo que no es necesario reiniciar la extensión cuando añades otra skill. La función requiere el permiso **file** de `multi-shell-mcp.enabledTools`, además de un espacio de trabajo de confianza.

## Protocolo oficial MCP Skills (2026-07-28)

Desde la versión 0.10.31, el servidor anuncia la extensión `io.modelcontextprotocol/skills` al recibir `server/discover` con el protocolo MCP moderno. El cliente puede llamar a `skills/list` para descubrir skills, `skills/get` para obtener la ficha de una skill concreta y `resources/read` para consultar sus archivos.

Cada ficha contiene el frontmatter YAML completo y un manifiesto de archivos con **SHA-256 y tamaño real en bytes**. Las skills con nombres iguales en ventanas diferentes conservan URI propias y no se sobrescriben. El listado admite paginación. El servidor anuncia `directoryRead: false`, por lo que `resources/directory/read` no está habilitado ni debe utilizarse.

Los clientes MCP anteriores conservan sus herramientas `list_skills_code`, `read_skill_code` y `read_skill_file_code` sin necesidad de migrar. El servidor moderno reutiliza las restricciones de autorización y de `shell_id`.

## Plugin instalable de ChatGPT y Codex

La distribución portátil está en `plugins/multishell-mcp/`, con `plugin.json`, `mcp.json` y las skills `setup` y `multishell-mcp`. El marketplace de desarrollo es `.agents/plugins/marketplace.json` (`multishell-local`).

Genera **un único VSIX con túnel integrado** mediante `npm run package`; si necesitas también el plugin opcional, usa `npm run package:all`. En Windows x64 son `multi-shell-mcp-server-0.10.72-win32-x64.vsix` y, cuando se solicita, `multi-shell-mcp-plugin-0.10.72.zip`. Para instalar el plugin de forma local en un cliente compatible, selecciona el marketplace del repositorio y autoriza la instalación; la compilación no instala nada automáticamente.

**Importante:** el `mcp.json` incluido apunta a `http://127.0.0.1:3000/mcp`, accesible solo desde la misma máquina y con el puerto predeterminado. ChatGPT Work en la nube debe utilizar un conector MCP registrado con túnel seguro y configuración propia. No publiques el servidor local sin autenticación directamente en Internet. El plugin aporta las skills; no concede permisos nuevos.

## Uso directo con Codex y ChatGPT

- **Codex local:** puede detectar directamente las skills de `.agents/skills/` del repositorio y utilizarlas sin pasar por MCP. Este proyecto incluye `.agents/skills/multishell-mcp/SKILL.md` como ejemplo real de uso seguro de sus herramientas.
- **ChatGPT con el conector MCP:** puede descubrir y leer las skills del proyecto mediante las herramientas MCP nuevas. Eso no implica que las instale en el selector de skills nativo de ChatGPT.
- **Distribución nativa como plugin:** para ofrecer una skill instalable mediante `@` o desde un directorio de plugins, es necesario empaquetarla como un plugin compatible. Una conexión MCP por sí sola no instala skills en el cliente.

## Skills globales de Codex (0.10.32)

MultiShell puede utilizar **directamente** las skills instaladas para el usuario de Windows o Linux, sin duplicarlas ni copiarlas al proyecto. Se buscan en `~/.agents/skills/` (personal), `~/.codex/skills/` (compatibilidad) y `~/.codex/skills/.system/` (skills del sistema instaladas como archivos). Los enlaces del directorio de instalación únicamente se admiten si permanecen dentro del directorio personal autorizado. Dentro de la skill elegida, los enlaces se rechazan: autorizar skills globales no concede lectura del resto del directorio personal.

El ajuste `multi-shell-mcp.globalCodexSkills` está **desactivado por defecto**. Se puede activar desde la configuración de VS Code o mediante el comando de paleta **MultiShell MCP: Mostrar skills disponibles**, que solicita confirmación antes de habilitar la lectura global. Requiere además `multi-shell-mcp.enabledTools.file=true`. Esto concede lectura a los clientes MCP conectados, incluidos los que llegan por un túnel; no ejecuta scripts ni modifica las autorizaciones de terminales.

Para conseguir una **lista rápida por nombre** hay tres opciones:

1. Ejecutar **MultiShell MCP: Mostrar skills disponibles** en la paleta de comandos de VS Code (`Ctrl+Mayús+P`). Se pueden buscar nombres y copiar el seleccionado.
2. Desde ChatGPT con el conector actualizado, usar `list_skill_names_code(shell_id="fallouttraduccion",scope="all")`. `scope="global"` muestra solo las globales; `query="graph"` filtra nombres.
3. Si ChatGPT conserva el esquema anterior del conector, usar `execute_shell_command_code(command="skills fallouttraduccion global",cwd="@mcp")`, que **no ejecuta ninguna orden en la terminal**. `skills fallouttraduccion` muestra globales y locales.

Las respuestas incluyen una lista `names` alfabética y, si hay nombres coincidentes, entradas diferenciadas por `scope`, `source` y `skill_path`. Para leer una skill, usa el `skill_path` exacto devuelto por el servidor. Las instrucciones de skills desconocidas deben tratarse como contenido no confiable.

## Ventanas y máquinas independientes (0.10.33)

Cada petición identifica la terminal mediante `shell_id`. MultiShell dirige la lectura de la skill al **worker de la ventana propietaria**, y esta ventana aplica sus propios permisos y rutas. Las listas de ventanas y terminales incorporan un `machine_id` de la instalación local, además de `window_id`. Es un identificador de instalación, no una identificación de hardware.

Dos ventanas con skills del mismo nombre pueden ofrecer instrucciones distintas. Sus URIs `skill://workspace/...` son diferentes y no se eliminan por coincidencia de nombre. Si una ventana se desconecta, la búsqueda no se traslada al disco del coordinador. Las skills globales pertenecen al usuario de la máquina que ejecuta el worker; solo se exponen cuando los permisos del coordinador y de la ventana propietaria lo permiten.

**Límite actual:** el enlace interno de MultiShell entre ventanas es local (`127.0.0.1`). Dos ordenadores no forman automáticamente un único coordinador. Para trabajar desde ChatGPT con varios equipos, configura **una conexión MCP segura distinta por máquina** y selecciona expresamente servidor, ventana y terminal. No publiques sin autenticación el puerto local; un futuro modo de federación requeriría autenticación mutua y cifrado.

## Mejoras de lectura y descubrimiento (0.10.34)

El método moderno `skills/list` calcula los hashes solo de la página actual, con un máximo de veinte intentos de manifiesto. Un cursor inválido no calcula manifiestos. Las skills no disponibles pueden dejar una página más corta; continúa usando `nextCursor` cuando exista. Cada manifiesto devuelto sigue siendo completo.

Las terminales de una misma carpeta y ventana comparten descubrimiento. Carpetas, ventanas y máquinas distintas siguen separadas. Las lecturas rechazan archivos que cambian durante la consulta, y un `SKILL.md` modificado no se anuncia con sus metadatos anteriores.

El flujo incluido distingue descubrimiento de metadatos, carga selectiva de referencias y activación por el cliente con verificación de hashes. Leer el texto mediante una herramienta no instala ni activa por sí solo una skill nativa. Los selectores heredados `@shell:` y las consultas `@mcp` también se adaptan cuando el conector utiliza el protocolo moderno; se mantienen la validación de cabeceras y los permisos de lectura.

## Límites que siguen pendientes

El catálogo devuelve hasta 100 entradas por página, con búsqueda previa al límite y continuación mediante cursor. Las skills de plugins instalados, incluida la caché de ECC, no constituyen otra fuente automática. Para incorporarlas conviene un selector explícito de fuentes y consentimiento, sin explorar archivos arbitrarios de caché.

Las lecturas de disco siguen siendo síncronas, aunque están acotadas la memoria, la cantidad de archivos y los manifiestos de cada página. Las lecturas asíncronas serían una mejora adicional para directorios lentos o montados por red. La activación nativa por el cliente, el túnel remoto y Linux requieren su propia validación.

## Seguridad y límites

Las skills se **leen, nunca se ejecutan automáticamente**. La presencia de `scripts/` o `allowed-tools` no concede permisos adicionales. Ejecutar un script requiere una solicitud separada y la revisión correspondiente; usa `execute_isolated_command_code` solo para órdenes no interactivas y con precauciones ante operaciones destructivas.

Las lecturas de archivos quedan dentro de la skill elegida y del proyecto o fuente global autorizada. Se rechazan rutas absolutas, `..` y enlaces internos. No se exponen automáticamente las skills globales del usuario. El catálogo devuelve hasta 100 skills por página; `SKILL.md`, hasta 128 KiB; un archivo auxiliar, hasta 16 MiB; y cada manifiesto moderno, hasta 512 archivos y 16 MiB en total. Las lecturas se limitan también si un archivo crece durante la consulta.

Los mensajes dentro de una skill son contenido del proyecto y deben tratarse como instrucciones no confiables; nunca sustituyen las autorizaciones del usuario ni los permisos MCP.

[Volver a compatibilidad MCP](compatibilidad.md) · [Pruebas y validación](validacion.md)

## Flujo sencillo por MCP (0.10.35)

1. Selecciona el `shell_id` de tu proyecto con `list_shells_code`.
2. Usa `find_skills_code(shell_id="mi-proyecto", query="compilación")`. Busca por nombre y descripción en el proyecto; devuelve argumentos `load_arguments` listos para la siguiente llamada.
3. Pasa esos argumentos a `load_skill_code`, o indica directamente `skill="revisar-codigo"`. Si el nombre se repite, devuelve candidatos para elegir un `skill_path`.
4. Lee referencias concretas con `read_skill_file_code` y los datos `next.arguments` devueltos.

La búsqueda se aplica antes del límite de respuesta. `cursor` y `limit` permiten recorrer catálogos grandes; continúa con `next_cursor` y la misma consulta y alcance. Las herramientas anteriores se mantienen. Se exploran como máximo 4096 entradas por consulta y se avisa si se alcanza ese límite. El catálogo puede cambiar entre páginas; para un recorrido coherente, evita modificarlo mientras lo recorres.

El alcance predeterminado de las herramientas nuevas es `project`. Para skills personales, indica `scope="global"` o `all` y habilita el permiso local correspondiente. No se habilita automáticamente. Cargar instrucciones no las ejecuta ni instala una skill nativa en el cliente. La fuente de plugins ECC sigue necesitando integración explícita; no se amplían sus permisos en esta versión.

Edición compatible con 0.10.58.


Instaladores actuales: multi-shell-mcp-server-0.10.67.vsix y multi-shell-mcp-plugin-0.10.67.zip

## Skills preferidas (0.10.72)

En MultiShell MCP > Skills, pulsa la estrella de una skill para marcarla como preferida. Se guarda en el estado de VS Code del proyecto (máximo 24); no se modifica SKILL.md ni se abre una terminal. Las preferidas aparecen primero, incluso si estaban en páginas posteriores. La estrella permite retirarlas en cualquier momento.

Las skills personales pueden marcarse globalmente solo si el usuario ya activó multi-shell-mcp.globalCodexSkills. El permiso no se concede mediante la estrella. El listado MCP incluye un marcador de preferencia cuando corresponde; skills/list las presenta primero, pero ninguna skill se carga o ejecuta de forma automática en ChatGPT. El cliente decide cuándo leerla. La selección de cada proyecto es independiente y los datos almacenados son solo rutas.
