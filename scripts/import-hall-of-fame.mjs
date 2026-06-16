#!/usr/bin/env node
/**
 * Importador del Salón de la Fama de FIM.
 *
 * Lee una carpeta con SUBCARPETAS nombradas por las personas que salen en las
 * fotos ("Alexis y Daniro", "Sergio Alexandru y Danib (Supernenas)", "Alberto"…)
 * y, por cada subcarpeta:
 *   - deduce las personas (claves canónicas) a partir del nombre,
 *   - copia todas las imágenes a `public/hall-of-fame/<clave-combo>-<n>.<ext>`,
 *   - acumula el mote si va entre paréntesis ("(Supernenas)").
 * Al final genera `src/features/hall-of-fame/fim-photos.generated.ts`, que es la
 * FUENTE DE VERDAD de qué fotos/secciones existen (individuos y combos).
 *
 * Uso:
 *   node scripts/import-hall-of-fame.mjs ["carpeta origen"]
 * Por defecto lee de `public/hall-of-fame/_origen` (arrastra ahí tu carpeta).
 * Re-ejecútalo cuando añadas o cambies fotos; es idempotente.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.resolve(ROOT, process.argv[2] ?? "public/hall-of-fame/_origen");
const OUT_DIR = path.resolve(ROOT, "public/hall-of-fame");
const GEN_TS = path.resolve(
  ROOT,
  "src/features/hall-of-fame/fim-photos.generated.ts"
);

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

// Token (palabra del nombre de carpeta, normalizada) -> clave canónica.
const TOKEN_TO_KEY = {
  alberto: "alberto",
  albeltico: "alberto",
  alexandru: "alexandru",
  correas: "alexandru",
  alexis: "alexis",
  alexisbellako: "alexis",
  danib: "danib",
  daniblanco: "danib",
  dani: "danib",
  daniro: "daniro",
  fernando: "fernando",
  montero: "montero",
  sergio: "sergio",
  sergiomonty1: "sergio",
};

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function parseFolderName(name) {
  const paren = name.match(/\(([^)]+)\)/);
  const nickname = paren ? paren[1].trim() : null;
  const cleaned = name.replace(/\([^)]*\)/g, " ");
  const keys = [];
  for (const tok of cleaned.split(/[\s,]+/)) {
    const n = norm(tok);
    if (!n || n === "y") continue;
    const key = TOKEN_TO_KEY[n];
    if (key) {
      if (!keys.includes(key)) keys.push(key);
    } else {
      console.warn(`  ⚠ token desconocido en "${name}": "${tok}" (ignorado)`);
    }
  }
  keys.sort();
  return { keys, nickname };
}

async function listImages(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isFile() && IMG_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(e.name);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "es"));
}

async function main() {
  let srcStat;
  try {
    srcStat = await fs.stat(SRC);
  } catch {
    console.error(
      `\n❌ No encuentro la carpeta de origen:\n   ${SRC}\n\n` +
        `Arrastra tu carpeta (con sus subcarpetas) dentro de\n` +
        `   public/hall-of-fame/_origen\n` +
        `y vuelve a ejecutar, o pásame la ruta:\n` +
        `   node scripts/import-hall-of-fame.mjs "C:\\ruta\\a\\tu\\carpeta"\n`
    );
    process.exit(1);
  }
  if (!srcStat.isDirectory()) {
    console.error(`❌ ${SRC} no es una carpeta.`);
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Limpia las imágenes generadas anteriormente (no toca _origen).
  for (const e of await fs.readdir(OUT_DIR, { withFileTypes: true })) {
    if (e.isFile() && IMG_EXT.has(path.extname(e.name).toLowerCase())) {
      await fs.rm(path.join(OUT_DIR, e.name));
    }
  }

  const entries = new Map(); // comboKey -> { members, nickname, images: [] }

  for (const e of await fs.readdir(SRC, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const { keys, nickname } = parseFolderName(e.name);
    if (keys.length === 0) {
      console.warn(`  ⚠ "${e.name}" no mapea a ninguna persona conocida. Saltada.`);
      continue;
    }
    const comboKey = keys.join("-");
    const cur =
      entries.get(comboKey) ?? { members: keys, nickname: null, images: [] };
    if (nickname && !cur.nickname) cur.nickname = nickname;

    const imgs = await listImages(path.join(SRC, e.name));
    for (const img of imgs) {
      const ext = path.extname(img).toLowerCase();
      const dest = `${comboKey}-${cur.images.length + 1}${ext}`;
      await fs.copyFile(
        path.join(SRC, e.name, img),
        path.join(OUT_DIR, dest)
      );
      cur.images.push(`/hall-of-fame/${dest}`);
    }
    entries.set(comboKey, cur);
  }

  const list = [...entries.values()]
    .filter((x) => x.images.length > 0)
    .sort((a, b) => a.members.length - b.members.length || a.members[0].localeCompare(b.members[0]));

  const body = list
    .map(
      (x) =>
        `  { key: ${JSON.stringify(x.members.join("-"))}, members: ${JSON.stringify(
          x.members
        )}, nickname: ${JSON.stringify(x.nickname)}, images: ${JSON.stringify(
          x.images
        )} },`
    )
    .join("\n");

  const ts = `// AUTOGENERADO por scripts/import-hall-of-fame.mjs — NO editar a mano.
// Re-ejecuta el script cuando cambies las fotos.
export interface FimPhotoEntry {
  /** Claves de los miembros unidas por "-" (orden alfabético). */
  key: string;
  members: string[];
  nickname: string | null;
  /** Rutas públicas (p. ej. "/hall-of-fame/sergio-1.jpg"). */
  images: string[];
}

export const FIM_PHOTOS: FimPhotoEntry[] = [
${body}
];
`;

  await fs.mkdir(path.dirname(GEN_TS), { recursive: true });
  await fs.writeFile(GEN_TS, ts, "utf8");

  const singles = list.filter((x) => x.members.length === 1).length;
  const combos = list.length - singles;
  console.log(
    `\n✅ Importadas ${list.reduce((a, x) => a + x.images.length, 0)} fotos: ` +
      `${singles} individuos, ${combos} combos.\n   → ${path.relative(ROOT, GEN_TS)}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
