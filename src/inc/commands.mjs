import { binfo, search, getSourceDirectories, scriptPaths, addSourceDirectory, getScripts } from "./sources.mjs";
import { confirm, selection } from "./helpers.mjs";
import { getBins, relinkBins, makeScriptExecutable } from './bins.mjs'
import { ZXB_PATHS, get, update as updateConfig } from "./config.mjs";
import { version } from "./github.mjs";

let commandInfo = {};


commandInfo.link = {
	desc: "Ensure all your script files have an executable in the bin directory.",
	usage: `zxb link [--force]`
};
async function link() {

	if (await relinkBins()) {
		console.log("\nDone!");
	} else {
		console.log("All executables are already linked.")
		console.log(chalk.gray("Use the --force if you must"));
	}
}

commandInfo.clean = {
	desc: "Remove bin files from the bin directory that don't have a matching script.",
	usage: `zxb clean`
};
async function clean() {
	console.log("Cleaning up the the bin directory.");

	const realBins = await getBins()
	const expectedBins = (await binfo()).map(info => info.bin)

	for (const bin of realBins) {

		if (expectedBins.includes(bin)) {
			continue;
		}

		const name = path.basename(bin)
		if (await confirm(`Delete ${name}?`, "y")) {
			await $`rm ${bin}`;
		}

	}

	console.log("Bins directory is clean!");
}




commandInfo.create = {
	desc: `Create a new script`,
	usage: `zxb create <script-name>`
};
async function create(slug) {

	if (!slug) {
		throw new Error(`Scripts must have a name.\n${commandInfo.create.usage}`);
	}

	const { file, bin } = await search(slug)

	if (await fs.pathExists(file)) {
		console.log(
			`${chalk.bold(slug)} already exists:`,
			`\n`,
			`-> ${file}`,
		);

		if (await confirm(`Would you like to edit ${chalk.bold(slug)} ?`, "y")) {
			return await edit(slug);
		}
		return true;
	}

	const commandExists = await nothrow($`which ${slug}`);

	if (commandExists.exitCode !== 1) {
		const alias = (await $`which ${slug}`).stdout;
		console.log(
			`Command "${chalk.bold(slug)}" is already aliased to "${alias.trim()}"\n`
		);
		process.exit(1);
	}

	if (false === await confirm(`Create new command "${chalk.bold(slug)}"?`)) {
		process.exit(0);
	}

	console.log("Creating a new command: " + slug);


	const directories = [...getSourceDirectories()];
	let directory = directories[0]

	if (directories.length > 1) {
		directory = await selection(directories, `Which directory to use?`)
	}

	if (!directory) {
		throw new Error("No directory selected");
	}



	const info = scriptPaths(`${directory}/${slug}.mjs`)

	await $`echo '#!/usr/bin/env zx' >> ${info.file}`;
	await $`chmod +x ${info.file}`;

	await makeScriptExecutable(info)
	await edit(slug)

	return info.file;
}





commandInfo.edit = {
	desc: `Edit scripts. If no script name is specified, will open all scripts and the ~/.zxb directory`,
	usage: `zxb edit [script-name]`
};
async function edit(slug) {

	if (slug) {
		const { file } = await search(slug);
		if (file && await fs.pathExists(file)) {
			return await editor(file);
		}
	}


	fs.ensureDir(ZXB_PATHS.sources)

	for (const source of getSourceDirectories()) {
		const dirname = path.basename(source);
		const symlink = `${ZXB_PATHS.sources}/${dirname}`
		if (!fs.pathExistsSync(symlink) && fs.pathExistsSync(source) && fs.isDirectorySync(source)) {
			await $`ln -s ${source} ${symlink}`;
		}
	}
	await editor(ZXB_PATHS.zxb)
}

async function editor(path) {
	const edit = process.env.EDITOR || `code`;

	// If using VSCode, open in a new window
	let res;
	if (edit === 'code') {
		res = await nothrow($`code -n ${path}`)
	} else {
		res = await $`${edit} ${path}`.pipe(process.stdout)
	}

	if (res.exitCode == 0) {
		return true;
	}

	console.log("")
	console.log(chalk.bold("Editor missing!"));
	console.log(`I tried to use "${chalk.bold(edit)}" to open ${path}`)
	console.log(`\n 🔗 ${chalk.bold("Read more here: ")}\nhttps://github.com/pyronaur/zxb/tree/main#code-editor\n`)
	throw new Error(res)
}









commandInfo.remove = {
	desc: `Remove and unlink a script`,
	usage: `zxb remove <script-name>`
};
async function remove(slug) {

	if (!slug) {
		throw new Error(`You mus specify which script to remove.\n${commandInfo.remove.usage}`);
	}

	const { file, bin } = await search(slug);

	if (!file && !bin) {
		console.log(`🍀 You're in luck! ${slug} doesn't exist already!`)
		return;
	}

	if (false === await confirm(`Delete command "${chalk.bold(slug)}"?`)) {
		return false;
	}

	await $`rm ${file}`;
	await $`rm ${bin}`;
}









commandInfo.list = {
	desc: `List all known scripts.`,
	usage: `zxb list ${chalk.gray(`| zxb ls`)}`
};
async function list() {

	const sourceDirs = getSourceDirectories();

	let output = ``;

	for (const directory of sourceDirs) {
		const scripts = await getScripts(directory);

		output += `\n `
		output += chalk.gray(directory)
		output += scripts
			.map(scriptPaths)
			.map(({ slug, bin }) => {
				const binExists = fs.pathExistsSync(bin);
				const symbol = binExists ? chalk.bold.green('·') : chalk.bold.red('x');


				let scriptOutput = `\n ${symbol} ${slug}`;
				if (!binExists) {
					scriptOutput += chalk.gray.gray(` <-- script executable missing`)
				}

				return scriptOutput;
			})
			.join("")
		output += `\n `
	}
	console.log(output);
}
commandInfo.update = {
	desc: `Update zxb from GitHub`,
	usage: `zxb update`
};
async function update() {

	const latestVersion = await version();
	const currentVersion = await get('version');

	if (latestVersion === currentVersion) {
		console.log(`${latestVersion} is the latest version! You're up to date.`)
		return;
	}

	const confirmUpdate = `Your version:		${chalk.bold(currentVersion)}\nLatest on GitHub:	${chalk.bold(latestVersion)}\nUpdate? `
	if (currentVersion && currentVersion !== latestVersion && false === await confirm(confirmUpdate, 'y')) {
		return;
	}

	console.log("\nUpdating...")
	cd(`${ZXB_PATHS.zxb}/inc`);
	const result = await $`zx install.mjs --update`;
	if (result.exitCode !== 0) {
		throw new Error(result);
	}
	updateConfig("version", latestVersion)
	console.log("Done!")
}


commandInfo.add_source = {
	desc: `Add an additional directory to use as script source.`,
	usage: `zxb add_source`
};
async function add_source(sourceDir) {
	if (sourceDir && !fs.pathExistsSync(sourceDir)) {
		console.log(`The path you provided doesn't exist. Are you sure it's correct?`)
		console.log(path.resolve(sourceDir))
		if (! await confirm("\nContinue?")) {
			return;
		}
	}
	await addSourceDirectory(sourceDir);

	// After a new directory is added, it might need to relink
	await relinkBins();
}
commandInfo.clean = {
	desc: "Install a zx script from a remote URL.",
	usage: `zxb install <url>`
};
async function install(scriptURL) {
	const sourceRequest = await fetch(scriptURL);
	if (sourceRequest.status !== 200) {
		throw new Error(`Could not download script from ${scriptURL}`)
	}
	const source = await sourceRequest.text();
	// Check if the first line is zx
	if (!source.split('\n')[0].includes('#!/usr/bin/env zx')) {
		throw new Error(`Can't install a script that's missing zx shebang.`);
	}

	const slug = path.basename(scriptURL).split('.')[0];
	const createdFile = await create(slug);
	if (createdFile && fs.existsSync(createdFile)) {
		fs.writeFile(createdFile, source);
	}
}


export const commands = {
	link: {
		...commandInfo.link,
		command: link
	},
	clean: {
		...commandInfo.clean,
		command: clean
	},
	create: {
		...commandInfo.create,
		command: create
	},
	edit: {
		...commandInfo.edit,
		command: edit
	},
	remove: {
		...commandInfo.remove,
		command: remove
	},
	list: {
		...commandInfo.list,
		command: list
	},
	update: {
		...commandInfo.update,
		command: update
	},
	add_source: {
		...commandInfo.add_source,
		command: add_source
	},
	install: {
		...commandInfo.install,
		command: install
	}
}
