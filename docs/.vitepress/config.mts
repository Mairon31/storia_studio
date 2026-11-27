import { defineConfig } from "vitepress";

const REPO_BASE = ["https://", "github.com/", "Mairon31/storia_studio"].join("");
const DISCORD_URL = "https://discord.gg/ahJM3hyFWr";

export default defineConfig({
  lang: "es-ES",
  title: "Storia Studio",
  description:
    "Editor de video 2D y retro local-first con motor WebGL2 a 60 FPS, 23 estilos de animación y control en vivo por IA mediante MCP.",
  base: process.env.DOCS_BASE ?? "/storia_studio/",
  cleanUrls: true,
  lastUpdated: false,
  appearance: true,
  srcExclude: ["README.md", "i18n/**"],

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/storia_studio/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#ffffff" }],
    ["meta", { property: "og:title", content: "Storia Studio — Documentación" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Editor de video 2D y retro local-first con WebGL2 a 60 FPS, 23 estilos de animación, exportación 1:1 FFmpeg y MCP para IAs.",
      },
    ],
  ],

  themeConfig: {
    logo: {
      light: "/logo-light.svg",
      dark: "/logo-dark.svg",
      alt: "Storia Studio",
    },
    siteTitle: "Storia Studio",

    nav: [
      { text: "Inicio", link: "/" },
      { text: "Documentación", link: "/getting-started", activeMatch: "^/(getting-started|architecture|mcp-and-remote|releases-and-updates|security)" },
      { text: "Arquitectura", link: "/architecture" },
      { text: "MCP & Remoto", link: "/mcp-and-remote" },
      { text: "Releases", link: "/releases-and-updates" },
      { text: "Discord", link: DISCORD_URL },
    ],

    sidebar: [
      {
        text: "Guía principal",
        items: [
          { text: "Primeros pasos e instalación", link: "/getting-started" },
          { text: "Arquitectura y motor creativo", link: "/architecture" },
        ],
      },
      {
        text: "Conectividad y distribución",
        items: [
          { text: "MCP para IAs y acceso remoto", link: "/mcp-and-remote" },
          { text: "Releases, canales y actualizaciones", link: "/releases-and-updates" },
        ],
      },
      {
        text: "Confianza",
        items: [{ text: "Política de seguridad", link: "/security" }],
      },
    ],

    socialLinks: [
      { icon: "discord", link: DISCORD_URL, ariaLabel: "Discord de Storia Studio" },
      { icon: "github", link: REPO_BASE, ariaLabel: "Repositorio en GitHub" },
    ],

    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "Buscar",
            buttonAriaLabel: "Buscar en la documentación",
          },
          modal: {
            displayDetails: "Mostrar detalles",
            resetButtonTitle: "Limpiar búsqueda",
            backButtonTitle: "Cerrar búsqueda",
            noResultsText: "Sin resultados para",
            footer: {
              selectText: "abrir",
              navigateText: "navegar",
              closeText: "cerrar",
            },
          },
        },
      },
    },

    outline: {
      level: [2, 3],
      label: "En esta página",
    },

    docFooter: {
      prev: "Anterior",
      next: "Siguiente",
    },

    darkModeSwitchLabel: "Apariencia",
    lightModeSwitchTitle: "Cambiar a modo claro",
    darkModeSwitchTitle: "Cambiar a modo oscuro",
    sidebarMenuLabel: "Menú",
    returnToTopLabel: "Volver arriba",
    langMenuLabel: "Idioma",
  },
});
