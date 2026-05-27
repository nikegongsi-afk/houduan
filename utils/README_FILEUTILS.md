# 文件工具使用说明

## 问题解决

为了避免 macOS 权限问题（Operation not permitted），所有文件保存操作现在都使用项目内的 `temp` 目录，而不是桌面或其他系统目录。

## 使用方法

### 导入工具函数

```javascript
const { 
  getTempDir, 
  saveFileToTemp, 
  readFileFromTemp, 
  deleteFileFromTemp,
  getTempFilePath 
} = require('./utils/fileUtils');
```

### 保存文件

```javascript
// 保存文本文件
const filePath = saveFileToTemp('example.txt', '文件内容', 'texts');

// 保存二进制文件（Buffer）
const buffer = Buffer.from('二进制内容', 'utf8');
const filePath = saveFileToTemp('example.bin', buffer, 'binary');
```

### 读取文件

```javascript
const content = readFileFromTemp('example.txt', 'texts');
console.log(content.toString());
```

### 删除文件

```javascript
const deleted = deleteFileFromTemp('example.txt', 'texts');
```

### 获取临时目录路径

```javascript
const tempDir = getTempDir();
console.log('临时目录:', tempDir);
// 输出: 临时目录: /path/to/project/temp
```

## 注意事项

1. **自动创建目录**: 如果 `temp` 目录不存在，工具会自动创建
2. **子目录支持**: 可以使用 `subDir` 参数组织文件到不同的子目录
3. **权限安全**: 所有文件都保存在项目目录内，不需要系统权限

## 如果错误来自其他服务

如果错误信息显示来自 `localhost:5001` 或其他端口，那可能是：
- 前端应用
- 其他后端服务
- 第三方工具

需要修改那个服务的代码，将文件保存路径改为项目内的目录。

