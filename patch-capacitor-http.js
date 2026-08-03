import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const targetFile = path.join(
  __dirname,
  'node_modules',
  '@capacitor',
  'http',
  'android',
  'build.gradle'
)

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8')
  if (!content.includes('namespace')) {
    content = content.replace(
      /android\s*\{/,
      'android {\n    namespace "com.capacitorjs.plugins.http"'
    )
    fs.writeFileSync(targetFile, content, 'utf8')
    console.log('✅ Successfully added namespace to @capacitor/http')
  }
}

const httpJavaFile = path.join(
  __dirname,
  'node_modules',
  '@capacitor',
  'http',
  'android',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'plugin',
  'http',
  'Http.java'
)

if (fs.existsSync(httpJavaFile)) {
  let content = fs.readFileSync(httpJavaFile, 'utf8')
  let changed = false

  if (content.includes('import com.getcapacitor.PluginRequestCodes;')) {
    content = content.replace('import com.getcapacitor.PluginRequestCodes;', '')
    changed = true
  }

  if (content.includes('.error(')) {
    content = content.replace(/\.error\(/g, '.reject(')
    changed = true
  }

  if (changed) {
    fs.writeFileSync(httpJavaFile, content, 'utf8')
    console.log('✅ Successfully patched Http.java in @capacitor/http')
  }
}
