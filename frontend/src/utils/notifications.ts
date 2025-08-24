import toast from "react-hot-toast";

export interface NotificationOptions {
  duration?: number;
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}

export const notifications = (() => {
  const MAX_TOASTS = 3;
  let activeToastIds: Array<string | number> = [];

  function cleanInactive() {
    activeToastIds = activeToastIds.filter((id) => !!toast.isActive(id));
  }

  function pushId(id: string | number) {
    cleanInactive();
    if (activeToastIds.length >= MAX_TOASTS) {
      // dismiss the oldest
      const oldest = activeToastIds.shift();
      if (oldest !== undefined) toast.dismiss(oldest);
    }
    activeToastIds.push(id);
  }

  function makeOptions(options?: NotificationOptions) {
    return {
      duration: options?.duration,
      position: options?.position || "top-right",
      style: {
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
      },
    } as any;
  }

  return {
    success: (message: string, options?: NotificationOptions) => {
      const id = toast.success(message, makeOptions(options));
      pushId(id);
      return id;
    },

    error: (message: string, options?: NotificationOptions) => {
      const opts = makeOptions(options);
      opts.duration = options?.duration || 6000;
      const id = toast.error(message, opts);
      pushId(id);
      return id;
    },

    info: (message: string, options?: NotificationOptions) => {
      const opts = makeOptions(options);
      const id = toast(message, { ...opts, icon: "ℹ️" });
      pushId(id);
      return id;
    },

    loading: (message: string) => {
      const id = toast.loading(message, {
        style: {
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        },
      });
      pushId(id);
      return id;
    },

    promise: <T>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: any) => string);
      }
    ) => {
      // We don't need to track the promise id (toast.promise handles it), but enforce limit by creating a loading toast first
      const loadingId = toast.loading(messages.loading, {
        style: {
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        },
      });
      pushId(loadingId);
      const wrapped = toast.promise(promise, messages, {
        style: {
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        },
      });
      return wrapped;
    },

    desktop: {
      scraperStarted: (gameCount: number) => {
        notifications.success(
          `Scraper started for ${gameCount} game${gameCount === 1 ? "" : "s"}`,
          { duration: 3000 }
        );
      },

      scraperStopped: () => {
        notifications.info("Scraper stopped", { duration: 2000 });
      },

      gameAdded: (gameName: string) => {
        notifications.success(`Added "${gameName}" to queue`, { duration: 2000 });
      },

      gameRemoved: (count: number) => {
        notifications.success(
          `Removed ${count} game${count === 1 ? "" : "s"} from queue`,
          { duration: 2000 }
        );
      },

      exportStarted: () => {
        notifications.loading("Preparing export...");
      },

      exportCompleted: (filename: string) => {
        notifications.success(`Export saved as ${filename}`, { duration: 5000 });
      },
    },
  };
})();

// Desktop app specific utilities
export const desktopUtils = {
  // Request file save location (mock for now - would integrate with Electron)
  requestSaveLocation: async (defaultName: string): Promise<string | null> => {
    // In a real Electron app, this would use dialog.showSaveDialog
    const fileName = prompt("Save as:", defaultName);
    return fileName;
  },

  // Export data to file (mock for now)
  exportToFile: async (data: any, filename: string, type: "json" | "csv" = "json") => {
    const exportId = notifications.loading("Preparing export...");
    
    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      let content: string;
      let mimeType: string;
      
      if (type === "json") {
        content = JSON.stringify(data, null, 2);
        mimeType = "application/json";
      } else {
        // Simple CSV conversion
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0]).join(",");
          const rows = data.map(row => Object.values(row).join(",")).join("\n");
          content = `${headers}\n${rows}`;
        } else {
          content = "No data to export";
        }
        mimeType = "text/csv";
      }
      
      // Create download link
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.dismiss(exportId);
      notifications.desktop.exportCompleted(filename);
    } catch (error) {
      toast.dismiss(exportId);
      notifications.error("Export failed");
      throw error;
    }
  },

  // Get system info (mock for now)
  getSystemInfo: () => {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      memory: (navigator as any).deviceMemory || "Unknown",
      cores: navigator.hardwareConcurrency || "Unknown",
      language: navigator.language,
    };
  },
};
