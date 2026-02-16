"use strict";
/**
 * Mock Database Manager
 * 用于开发测试，绕过 better-sqlite3 编译问题
 * 生产环境替换为 DatabaseManager
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockDatabaseManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class MockDatabaseManager {
    constructor(dbPath) {
        this.tables = {};
        this.initialized = false;
        this.dbPath = dbPath || path.join(process.cwd(), 'mock-data.json');
    }
    /**
     * 初始化 Mock 数据库
     */
    async initialize() {
        try {
            // 尝试加载已有数据
            const data = await fs.readFile(this.dbPath, 'utf-8');
            this.tables = JSON.parse(data);
        }
        catch {
            // 文件不存在，创建新数据库
            this.tables = {
                projects: [],
                files: [],
                undo_history: [],
                settings: [],
            };
            await this.save();
        }
        this.initialized = true;
        console.log('[MockDatabaseManager] Initialized at:', this.dbPath);
    }
    /**
     * 保存数据到文件
     */
    async save() {
        await fs.writeFile(this.dbPath, JSON.stringify(this.tables, null, 2));
    }
    /**
     * 插入数据
     */
    async insert(table, data) {
        if (!this.initialized)
            throw new Error('Database not initialized');
        if (!this.tables[table]) {
            this.tables[table] = [];
        }
        this.tables[table].push({
            ...data,
            _id: Date.now().toString(),
            _created: new Date().toISOString(),
        });
        await this.save();
    }
    /**
     * 查询数据
     */
    async select(table, where) {
        if (!this.initialized)
            throw new Error('Database not initialized');
        let results = this.tables[table] || [];
        if (where) {
            results = results.filter(item => {
                return Object.entries(where).every(([key, value]) => item[key] === value);
            });
        }
        return results;
    }
    /**
     * 更新数据
     */
    async update(table, where, data) {
        if (!this.initialized)
            throw new Error('Database not initialized');
        const items = this.tables[table] || [];
        for (const item of items) {
            const match = Object.entries(where).every(([key, value]) => item[key] === value);
            if (match) {
                Object.assign(item, data, { _updated: new Date().toISOString() });
            }
        }
        await this.save();
    }
    /**
     * 删除数据
     */
    async delete(table, where) {
        if (!this.initialized)
            throw new Error('Database not initialized');
        const items = this.tables[table] || [];
        this.tables[table] = items.filter(item => {
            return !Object.entries(where).every(([key, value]) => item[key] === value);
        });
        await this.save();
    }
    /**
     * 关闭数据库
     */
    async close() {
        await this.save();
        this.initialized = false;
        console.log('[MockDatabaseManager] Closed');
    }
}
exports.MockDatabaseManager = MockDatabaseManager;
//# sourceMappingURL=MockDatabaseManager.js.map