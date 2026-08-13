#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
import os
from pathlib import Path
import shutil

# 加密密钥（与C++代码保持一致）
KEY = 114514

# 需要排除的目录名称
EXCLUDED_DIRS = {
    'archive',
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '__pycache__',
    '.vscode',
    '.idea',
    'dist',  # 可能包含构建产物
    'build',
    'temp',
    'tmp',
    'logs'
}

# 需要排除的文件扩展名
EXCLUDED_EXTENSIONS = {
    '.sh', '.bat', '.cmd', '.py', '.pyc', '.pyo',
    '.ps1', '.vbs', '.js.map', '.ts', '.tsx',
    '.scss', '.less', '.styl',
    '.md', '.markdown', '.rst', '.txt', '.log',
    '.gitignore', '.gitattributes', '.gitkeep',
    '.env', '.env.local', '.env.development', '.env.production',
    '.eslintrc', '.prettierrc', '.babelrc',
    '.npmrc', '.yarnrc',
    '.editorconfig',
    'Dockerfile', 'docker-compose.yml',
    '.xml', '.yml', '.yaml', '.toml',
    '.ini', '.cfg', '.conf'
}

# 需要排除的具体文件名
EXCLUDED_FILES = {
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'webpack.config.js',
    'vite.config.js',
    'vite.config.ts',
    'rollup.config.js',
    'gulpfile.js',
    'Gruntfile.js',
    'Makefile',
    'CMakeLists.txt',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    '.eslintignore',
    '.prettierignore',
    '.dockerignore',
    'deploy.py',  # 部署脚本本身
    'deploy.bat',
    'deploy.sh'
}

def should_exclude(file_path: Path, source_dir: Path) -> bool:
    """判断文件或目录是否应该被排除"""
    rel_path = file_path.relative_to(source_dir)
    
    # 检查路径中的每个部分
    for part in rel_path.parts:
        # 排除特定目录
        if part in EXCLUDED_DIRS:
            return True
        
        # 排除以 . 开头的隐藏目录
        if part.startswith('.') and part != '.':
            return True
    
    # 如果是文件，检查扩展名和文件名
    if file_path.is_file():
        # 检查扩展名
        if file_path.suffix.lower() in EXCLUDED_EXTENSIONS:
            return True
        
        # 检查文件名（无扩展名的情况）
        if file_path.name in EXCLUDED_FILES:
            return True
        
        # 检查文件名是否以 . 开头（隐藏文件）
        if file_path.name.startswith('.'):
            return True
        
        # 检查是否为未知类型（不在白名单中的文件类型）
        if not is_known_asset_type(file_path):
            return True
    
    return False

def is_known_asset_type(file_path: Path) -> bool:
    """判断文件是否为已知的资源类型"""
    # 已知的资源类型白名单
    known_extensions = {
        # HTML/CSS
        '.html', '.htm', '.css',
        
        # JavaScript
        '.js', '.mjs', '.cjs',
        
        # 数据格式
        '.json', '.xml', '.txt', '.csv', '.tsv',
        
        # 字体
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        
        # 图片
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
        '.tiff', '.tif', '.avif',
        
        # 视频/音频
        '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.flac',
        
        # 文档
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        
        # 压缩文件
        '.zip', '.rar', '.7z', '.tar', '.gz',
        
        # 其他常见资源
        '.map', '.wasm'

    }
    
    return file_path.suffix.lower() in known_extensions

def should_encrypt(rel_path: Path) -> bool:
    """判断文件是否需要加密"""
    # 只加密特定类型的文件
    encrypt_extensions = {
        '.html', '.htm', '.js', '.mjs', '.cjs',
        '.css', '.json', '.xml', '.txt', '.svg',
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        '.map', '.wasm', '.png'
    }
    
    return rel_path.suffix.lower() in encrypt_extensions

def get_relative_path(file_path: Path, source_dir: Path) -> Path:
    """获取文件相对于源目录的路径"""
    return file_path.relative_to(source_dir)

def encrypt_data(data: bytes) -> bytes:
    """使用与C++相同的算法加密数据"""
    encrypted = bytearray(data)
    size = len(encrypted)
    
    x = KEY + size  # 初始值（与C++保持一致）
    
    for i in range(size):
        # 密钥流生成算法（与C++代码完全一致）
        x ^= (x >> 29) & 0x5555555555555555
        x ^= (x << 17) & 0x71D67FFFEDA60000
        x ^= (x << 37) & 0xFFF7EEE000000000
        x ^= (x >> 43)
        x ^= i
        
        # 确保x在字节范围内（0-255）
        key_byte = x & 0xFF
        encrypted[i] ^= key_byte
    
    return bytes(encrypted)

def process_resources(source_dir: Path, dest_dir: Path, verbose: bool = False):
    """处理资源文件：加密并复制到目标目录"""
    if not source_dir.exists():
        raise FileNotFoundError(f"源目录不存在: {source_dir}")
    
    # 创建目标目录
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    encrypted_count = 0
    copied_count = 0
    skipped_count = 0
    failed_count = 0
    
    # 遍历源目录中的所有文件和目录
    for file_path in source_dir.rglob('*'):
        # 如果是目录，跳过（由文件处理时创建目录）
        if file_path.is_dir():
            continue
        
        # 检查是否应该排除
        if should_exclude(file_path, source_dir):
            rel_path = get_relative_path(file_path, source_dir)
            skipped_count += 1
            if verbose:
                print(f"  ⏭️  跳过: {rel_path}")
            continue
        
        rel_path = get_relative_path(file_path, source_dir)
        dest_file = dest_dir / rel_path
        
        # 创建目标文件的父目录
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            # 读取源文件
            with open(file_path, 'rb') as f:
                data = f.read()
            
            # 判断是否需要加密
            if should_encrypt(rel_path):
                # 加密数据
                encrypted_data = encrypt_data(data)
                
                # 写入加密文件（添加 .z9enc 扩展名）
                dest_file_encrypted = dest_file.with_suffix(dest_file.suffix + '.z9enc')
                with open(dest_file_encrypted, 'wb') as f:
                    f.write(encrypted_data)
                
                encrypted_count += 1
                if verbose:
                    print(f"  🔐 加密: {rel_path} -> {dest_file_encrypted.name}")
            else:
                # 直接复制
                shutil.copy2(file_path, dest_file)
                copied_count += 1
                if verbose:
                    print(f"  📄 复制: {rel_path}")
                    
        except Exception as e:
            failed_count += 1
            print(f"  ❌ 处理失败: {rel_path} - {e}")
    
    return encrypted_count, copied_count, skipped_count, failed_count

def main():
    parser = argparse.ArgumentParser(description='前端资源部署和加密工具')
    parser.add_argument('source', help='源目录路径')
    parser.add_argument('dest', nargs='?', default=None, help='目标目录路径')
    parser.add_argument('--verbose', '-v', action='store_true', help='显示详细信息')
    parser.add_argument('--no-encrypt', action='store_true', help='禁用加密（仅复制）')
    parser.add_argument('--dry-run', action='store_true', help='模拟运行')
    
    args = parser.parse_args()
    
    if args.dest is None:
        script_dir = Path(__file__).parent
        dest_dir = script_dir / 'resources'
    else:
        dest_dir = Path(args.dest)
    
    source_dir = Path(args.source)
    
    print("=" * 60)
    print("前端资源部署工具")
    print("=" * 60)
    print(f"源目录: {source_dir}")
    print(f"目标目录: {dest_dir}")
    print("-" * 60)
    
    if args.dry_run:
        print("🔍 模拟运行模式")
        if not source_dir.exists():
            print(f"❌ 源目录不存在: {source_dir}")
            return
        
        print("\n将被处理的文件:")
        for file_path in source_dir.rglob('*'):
            if file_path.is_file() and not should_exclude(file_path, source_dir):
                rel_path = get_relative_path(file_path, source_dir)
                if should_encrypt(rel_path):
                    print(f"  🔐 加密: {rel_path}")
                else:
                    print(f"  📄 复制: {rel_path}")
        
        print("\n将被跳过的文件和目录:")
        for file_path in source_dir.rglob('*'):
            if file_path.is_file() and should_exclude(file_path, source_dir):
                rel_path = get_relative_path(file_path, source_dir)
                print(f"  ⏭️  跳过: {rel_path}")
        return
    
    try:
        if args.no_encrypt:
            # 仅复制模式（但仍需过滤）
            print("📋 仅复制模式（不加密）")
            processed_count = 0
            skipped_count = 0
            
            for file_path in source_dir.rglob('*'):
                if file_path.is_file():
                    if should_exclude(file_path, source_dir):
                        skipped_count += 1
                        if args.verbose:
                            rel_path = get_relative_path(file_path, source_dir)
                            print(f"  ⏭️  跳过: {rel_path}")
                        continue
                    
                    rel_path = get_relative_path(file_path, source_dir)
                    dest_file = dest_dir / rel_path
                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(file_path, dest_file)
                    processed_count += 1
                    if args.verbose:
                        print(f"  📄 复制: {rel_path}")
            
            print(f"\n✅ 复制完成!")
            print(f"  复制文件: {processed_count}")
            print(f"  跳过文件: {skipped_count}")
            print(f"目标目录: {dest_dir}")
        else:
            encrypted, copied, skipped, failed = process_resources(
                source_dir, dest_dir, args.verbose
            )
            
            print("-" * 60)
            print(f"✅ 处理完成!")
            print(f"  加密文件: {encrypted}")
            print(f"  复制文件: {copied}")
            print(f"  跳过文件: {skipped}")
            print(f"  失败文件: {failed}")
            print(f"  总计: {encrypted + copied + skipped + failed}")
            print("-" * 60)
            print(f"目标目录: {dest_dir}")
        
    except Exception as e:
        print(f"❌ 处理失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()