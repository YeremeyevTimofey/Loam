// The File System Access API pieces TypeScript's DOM library does not describe yet.
export {};

declare global {
  interface FileSystemPermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }
  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  }
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>;
  }
}
