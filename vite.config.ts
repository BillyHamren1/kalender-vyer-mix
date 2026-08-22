import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

type MobileMode = 'scanner' | 'time';

const mobileEntryPlugin = (mobileMode: MobileMode): Plugin => ({
  name: 'eventflow-mobile-entry',
  enforce: 'pre',
  transformIndexHtml(html) {
    const title = mobileMode === 'scanner' ? 'EventFlow Scanner' : 'EventFlow Time';
    const description = mobileMode === 'scanner'
      ? 'Säker lager- och packningsscanner'
      : 'Tidrapportering för fältpersonal';

    return html
      .replace('/src/main.tsx', `/src/main-${mobileMode}.tsx`)
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
      .replace(/\s*<!-- IMPORTANT: DO NOT REMOVE THIS SCRIPT TAG OR THIS VERY COMMENT! -->\s*/g, '\n    ')
      .replace(/\s*<script src="https:\/\/cdn\.gpteng\.co\/gptengineer\.js" type="module"><\/script>\s*/g, '\n    ');
  },
});

const bundleAuditPlugin = (mobileMode: MobileMode): Plugin => ({
  name: 'eventflow-bundle-audit',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle)
      .filter((item): item is Extract<typeof item, { type: 'chunk' }> => item.type === 'chunk')
      .map((chunk) => ({
        fileName: chunk.fileName,
        isEntry: chunk.isEntry,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        codeBytes: Buffer.byteLength(chunk.code, 'utf8'),
        modules: Object.keys(chunk.modules).map((id) => id.replaceAll('\\', '/')).sort(),
      }));

    this.emitFile({
      type: 'asset',
      fileName: 'bundle-audit.json',
      source: JSON.stringify({ mode: mobileMode, chunks }, null, 2),
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const mobileMode = mode === 'scanner' || mode === 'time' ? mode : null;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mobileMode && mobileEntryPlugin(mobileMode),
      mobileMode && bundleAuditPlugin(mobileMode),
      mode === 'development' && componentTagger(),
    ].filter(Boolean),
    optimizeDeps: {
      include: ['@radix-ui/react-hover-card'],
    },
    resolve: {
      alias: [
        ...(mobileMode ? [{
          find: '/src/main.tsx',
          replacement: path.resolve(__dirname, `./src/main-${mobileMode}.tsx`),
        }] : []),
        { find: '@', replacement: path.resolve(__dirname, './src') },
      ],
    },
  };
});
