/**
 * we're using some self-built native node modules, namely keytar and better-sqlite3.
 * these need to be bundled into the client.
 * keytar and better-sqlite3 have different ways of getting their native module loaded:
 * - keytar requires it directly
 * - better-sqlite3 exports a class whose constructor takes a path to the native module which is then required dynamically.
 *
 * this requires us to use different strategies for injecting the right path into the build process.
 * */
import fs from "node:fs"
import path from "node:path"
import { getNativeLibModulePath } from "./nativeLibraryProvider.js"

/**
 * Rollup plugin which injects path to better-sqlite3 native code.
 * See DesktopMain.
 */
export function sqliteNativeBannerPlugin({ environment, rootDir, dstPath, nativeBindingPath, platform }, log = console.log.bind(console)) {
	return {
		name: "sqlite-native-banner-plugin",
		async buildStart() {
			const modulePath = await getNativeLibModulePath({
				nodeModule: "better-sqlite3",
				environment,
				rootDir,
				log,
				platform,
				copyTarget: "better_sqlite3",
			})
			const normalDst = path.normalize(dstPath)
			const dstDir = path.dirname(normalDst)
			await fs.promises.mkdir(dstDir, { recursive: true })
			await fs.promises.copyFile(modulePath, normalDst)
		},
		banner() {
			const nativeLibPath = nativeBindingPath ?? dstPath
			return `
			globalThis.buildOptions = globalThis.buildOptions ?? {}
			globalThis.buildOptions.sqliteNativePath = "${nativeLibPath}";
			`
		},
	}
}

/**
 * Rollup plugin which injects path to keytar native code.
 */
export function keytarNativeBannerPlugin({ rootDir, platform }, log = console.log.bind(console)) {
	let outputPath
	return {
		name: "keytar-native-banner-plugin",
		async buildStart() {
			outputPath = await getNativeLibModulePath({
				nodeModule: "keytar",
				environment: "electron",
				rootDir,
				log,
				platform,
			})
		},
		resolveId(id) {
			if (id.endsWith("keytar.node")) {
				if (outputPath == null) {
					throw new Error("Something didn't quite work")
				}
				return outputPath
			}
		},
		async load(id) {
			if (id === outputPath) {
				const name = path.basename(id)
				const content = await fs.promises.readFile(id)
				this.emitFile({
					type: "asset",
					name,
					fileName: name,
					source: content,
				})
				return `
				const nativeModule = require('./${name}')
				export default nativeModule`
			}
		},
	}
}
