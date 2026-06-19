/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '../dist/win-unpacked/resources')
if (fs.existsSync(dir)) {
  fs.writeFileSync(
    path.join(dir, 'app-update.yml'),
    'owner: igormenin\nrepo: MultiChatIntegrator\nprovider: github\n'
  )
  console.log('Created app-update.yml in dist/win-unpacked/resources/')
} else {
  console.log('Directory not found: ' + dir)
}
