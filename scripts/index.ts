
// {
//   "folders": [
//     {
//       "path": "test-scenes/-1.49.interactions"
//     }
//   ],
//   "settings": {}
// }

import * as path from 'path'
import * as fs from 'fs-extra'
import { sync as globSync } from 'glob'
import { spawn } from 'child_process'

const SCENE_FACTORY_FOLDER = 'scene'
const TEST_SCENE_FOLDER = 'test-scenes'
const TSCONFIG_EXAMPLE_PATH = "tsconfig.example.json"

function getRemovableFilesFromSceneFolder() {
  const baseFiles =
    ['package.json', 'README.md', 'tsconfig.example.json', '.dclignore']

  return globSync('**/*', {
    cwd: path.resolve(process.cwd(), SCENE_FACTORY_FOLDER),
    dot: true,
    absolute: false
  })
    .filter(filePath => !baseFiles.includes(filePath))
    .filter(filePath => !filePath.startsWith('node_modules'))
    .map(filePath => path.resolve(process.cwd(), SCENE_FACTORY_FOLDER, filePath))
}

function removeFilesFromSceneFolder() {
  const files = getRemovableFilesFromSceneFolder()
  for (const filePath of files) {
    try {
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.rmdirSync(filePath, {})
      } else {
        fs.rmSync(filePath, {})
      }
    } catch (err) {

    }
  }
}

function getAllTestScene() {
  return globSync('*', {
    cwd: path.resolve(process.cwd(), TEST_SCENE_FOLDER),
    dot: true,
    absolute: true
  })
    .filter(sceneFolderPath => {
      if (!fs.lstatSync(sceneFolderPath).isDirectory())
        return false
      const gameTsPath = path.resolve(sceneFolderPath, 'game.ts')
      const sceneJsonPath = path.resolve(sceneFolderPath, 'scene.json')

      return fs.existsSync(gameTsPath) && fs.existsSync(sceneJsonPath)
    })
}

function getFiles(folder: string) {
  return globSync('**/*', {
    cwd: path.resolve(process.cwd(), folder),
    dot: true,
    absolute: false
  })
}

function copyScene(folder: string) {
  const files = getFiles(folder)
  for (const filePath of files) {
    const dstPath = path.resolve(SCENE_FACTORY_FOLDER, filePath)
    const srcPath = path.resolve(folder, filePath)

    if (fs.lstatSync(srcPath).isDirectory()) {
      fs.ensureDirSync(dstPath)
    } else {
      fs.ensureDirSync(path.dirname(dstPath))
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

function installDependencies(
  workingDir: string,
  silent: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      shell: true,
      cwd: workingDir,
      env: { ...process.env, NODE_ENV: '' }
    })

    if (!silent) {
      child.stdout.pipe(process.stdout)
      child.stderr.pipe(process.stderr)
    }

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`npm install exited with code ${code}.`)
        )
      }
      resolve()
    })
  })
}

function runBuild(workingDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('dcl', ['build'], {
      shell: true,
      cwd: workingDir,
      env: { ...process.env, NODE_ENV: '' }
    })

    let stdOut = ''
    let stdErr = ''

    child.stdout.on('data', (data) => {
      stdOut += data.toString()
    });

    child.stderr.on('data', (data) => {
      stdErr += data.toString()
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`Build exited with code ${code}. \n 
            > Standard output: \n ${stdOut} \n 
            > Error output: \n ${stdErr}`)
        )
      }
      resolve()
    })
  })
}


async function main() {
  removeFilesFromSceneFolder()

  await installDependencies(path.resolve(SCENE_FACTORY_FOLDER), false)

  const allTestScenes = getAllTestScene()
  for (const sceneFolder of allTestScenes) {
    if (!fs.existsSync(path.resolve(sceneFolder, 'game.js'))) {
      console.log(`Building scene '${sceneFolder.replace(path.resolve(process.cwd(), TEST_SCENE_FOLDER), '')}'`)
      try {
        const sceneJsonPath = path.resolve(SCENE_FACTORY_FOLDER, "scene.json")
        const tsConfigPath = path.resolve(SCENE_FACTORY_FOLDER, "tsconfig.json")

        copyScene(sceneFolder)
        fs.copyFileSync(path.resolve(SCENE_FACTORY_FOLDER, TSCONFIG_EXAMPLE_PATH), path.resolve(SCENE_FACTORY_FOLDER, "tsconfig.json"))

        const tsConfigJson = require(tsConfigPath)
        const sceneJson = require(sceneJsonPath)

        tsConfigJson.compilerOptions.outFile = sceneJson.main
        fs.writeJsonSync(tsConfigPath, tsConfigJson, { spaces: 2 })

        await runBuild(SCENE_FACTORY_FOLDER)

        const gameJsPath = path.resolve(SCENE_FACTORY_FOLDER, sceneJson.main)
        const gameJsLibPath = path.resolve(SCENE_FACTORY_FOLDER, `${sceneJson.main}.lib`)

        fs.copyFileSync(gameJsPath, path.resolve(sceneFolder, sceneJson.main))
        fs.copyFileSync(gameJsLibPath, path.resolve(sceneFolder, `${sceneJson.main}.lib`))

      } catch (err) {
        console.error(err)
      }
      removeFilesFromSceneFolder()
    }
  }

}

main()