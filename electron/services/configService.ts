import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppConfiguration } from '../../src/types/index'

const DEFAULT_CONFIG: AppConfiguration = {
  googleSheetId: '',
  serviceAccountPath: '',
  facebookApiToken: '',
  excludedTabs:
    'Configuration, RAW Data Aggregated, Dashboard Summary, Dashboard Summary (VNĐ), Ads Rules Status, Update Money, Update Money 1, CustomMessage, Bảng Tổng Hợp, USD mẫu',
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export class ConfigService {
  load(): AppConfiguration {
    try {
      const raw = fs.readFileSync(getConfigPath(), 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  save(config: AppConfiguration): void {
    const configPath = getConfigPath()
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }
}
