# Validación de MultiShell MCP 0.10.66 con túnel integrado

**Fecha:** 5 de noviembre de 2026. **Rama conservada:** `main`; HEAD previo `951337b`. Las modificaciones locales anteriores permanecen sin commit ni publicación.

## Método

Aplicadas las instrucciones locales de `systematic-debugging`, `verification-before-completion`, `test-driven-development`, `differential-review`, `mcp-builder` y `node`. Se priorizan pruebas reproducibles y comprobaciones de integridad. No se ha creado otra rama, ni instalado otra versión, ni detenido o reiniciado un proceso de túnel.

La prueba repetible incorporada es:

```powershell
node test/manual-integrated-install.cjs
# Prueba funcional del ejecutable oficial, con perfil ficticio y temporal:
node test/manual-integrated-native-init.cjs
```

Lee únicamente la instalación local, los hashes de los binarios oficiales, el estado del túnel y las herramientas MCP. No invoca operaciones de escritura ni de ejecución por MCP.

## Resultados observados

| Comprobación | Resultado |
| --- | --- |
| Extensión realmente instalada | `local-multishell.multi-shell-mcp-server@0.10.66` |
| Bundle instalado y bundle de desarrollo | SHA-256 idéntico |
| Binario oficial integrado | Versión `0.0.19`, `--version` devuelve 0 |
| `init` del ejecutable integrado con datos ficticios | Correcto: perfil temporal generado y eliminado, sin iniciar túnel |
| Hashes del túnel y de cloudflared | Coinciden con `verified.json` |
| Número de herramientas MCP activas | 32 |
| Resolución de la shell del proyecto | Correcta |
| `find-skills` mediante `list_skills_code` y `load_skill_code` | Correcta |
| `chat_handoff_list_code` | Correcta, sin modificar el almacén |
| `/readyz` y `/healthz` | HTTP 200 y HTTP 200 |
| Test de archivo VSIX específico de Windows x64 | Correcto |
| Pruebas de adopción del túnel y del ciclo de vida | Correctas |
| TypeScript, bundle y ESLint | Código de salida 0 |
| Batería completa de `scripts/run-tests.cjs` | **154/154 suites**: 52 + 51 + 51 |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades notificadas |
| `git diff --check` | Código de salida 0 |

## Distinción importante: integrado frente a activo

**El instalador incluye y verifica los dos ejecutables oficiales**, pero el proceso de túnel que está activo en esta máquina procede todavía de la copia verificada antigua alojada en `globalStorage`. Solo se observó **un proceso del túnel**. Esta preferencia está prevista por diseño para adoptar el proceso existente sin romper su identidad ni sus conexiones.

Por tanto, no se afirma que el proceso activo se haya iniciado desde el binario integrado. Queda **pendiente un ensayo de arranque real desde la ruta embebida** en una instalación sin copia global anterior o durante un cambio de versión autorizado. No se forzó ese cambio porque podía interrumpir la conexión con ChatGPT.

## Alcance y riesgos pendientes

- Las pruebas de Windows x64 no demuestran que los VSIX de Linux y macOS funcionen en sus respectivos sistemas. macOS requiere además comprobar las restricciones de Gatekeeper/notarización.
- No se ha realizado prueba de extremo a extremo del cliente integrado con credenciales reales **desde la ruta embebida**. El cliente activo sí respondió a comprobaciones de salud.
- Las suites automatizadas incluyen componentes aislados, mocks y contratos de integración. La prueba manual anterior añade comprobaciones contra el servidor MCP instalado y los ejecutables reales; ninguna de ellas justifica declarar que todo el sistema tiene fiabilidad absoluta.
- El almacenamiento global anterior y los artefactos de otros sistemas no se han borrado.
- `npm audit` comprueba dependencias registradas, no certifica la seguridad de binarios de terceros.

**Conclusión:** no se encontraron regresiones en las rutas sometidas a prueba. Se mantiene el desarrollo sobre `main` y la versión `0.10.66` sin necesidad de publicar otro artefacto solo por esta validación.

**Nota posterior (0.10.67):** este informe conserva los datos históricos de 0.10.66. La versión 0.10.67 corrige la prioridad en el autoarranque y añade una prueba específica, sin alterar estas mediciones.

**Actualización documental (0.10.68):** se conserva este informe histórico; la recuperación verificada entre versiones se documenta en [Túnel integrado](tunel-integrado.md).

**Actualización posterior de distribución (0.10.69):** los informes de 0.10.66 siguen siendo históricos; las compilaciones nuevas generan únicamente el VSIX nativo integrado.

**Actualización posterior (0.10.70):** este informe conserva sus mediciones históricas. El cliente integrado es ahora obligatorio para los arranques nuevos y no se permite la descarga durante la ejecución.

**Actualización documental (0.10.71):** las preferencias de skills no modifican el túnel; este informe conserva las pruebas históricas de la instalación anterior.
**Nota 0.10.72:** el informe histórico no incluye las pruebas posteriores de limpieza y retención.
