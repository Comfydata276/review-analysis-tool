import toast from "react-hot-toast";

export interface NotificationOptions {
  duration?: number;
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}

export const notifications = (() => {
  const MAX_TOASTS = 3;
  let activeToastIds: Array<string | number> = [];

  function cleanInactive() {
    // Simplified cleanup - just remove any undefined/null IDs
    activeToastIds = activeToastIds.filter((id) => id != null);
  }

  function pushId(id: string | number) {
    cleanInactive();

    // If we still have too many toasts after cleaning, dismiss the oldest ones
    while (activeToastIds.length >= MAX_TOASTS) {
      const oldest = activeToastIds.shift();
      if (oldest !== undefined) {
        toast.dismiss(oldest);
      }
    }

    activeToastIds.push(id);
  }

  function makeOptions(options?: NotificationOptions, toastType: 'success' | 'error' | 'info' | 'loading' = 'info') {
    // Base styles for all toasts
    const baseStyles = {
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
      fontWeight: '500',
      fontSize: '14px',
      lineHeight: '1.4',
      maxWidth: '400px',
      padding: '12px 16px',
      wordWrap: 'break-word' as const,
    };

    // Type-specific gradient backgrounds
    const getBackground = (type: string) => {
      switch (type) {
        case 'success':
          return 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)';
        case 'error':
          return 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%)';
        case 'info':
          return 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)';
        case 'loading':
          return 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(107, 114, 128, 0.1) 100%)';
        default:
          return 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
      }
    };

    return {
      duration: options?.duration,
      position: options?.position || "top-right",
      style: {
        ...baseStyles,
        background: getBackground(toastType),
        color: "var(--foreground)",
        // Ensure text is always readable
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
    } as any;
  }

  return {
    success: (message: string, options?: NotificationOptions) => {
      const opts = makeOptions(options, 'success');
      opts.duration = options?.duration || 2500;
      const id = toast.success(message, opts);
      pushId(id);
      return id;
    },

    error: (message: string, options?: NotificationOptions) => {
      // Maintain maximum of 3 toasts by dismissing oldest when limit reached
      if (activeToastIds.length >= MAX_TOASTS) {
        const oldest = activeToastIds.shift();
        if (oldest !== undefined) {
          toast.dismiss(oldest);
        }
      }

      const opts = makeOptions(options, 'error');
      opts.duration = options?.duration || 3000;
      const id = toast.error(message, opts);
      activeToastIds.push(id);
      return id;
    },

    info: (message: string, options?: NotificationOptions) => {
      const opts = makeOptions(options, 'info');
      opts.duration = options?.duration || 2500;
      const id = toast(message, { ...opts, icon: "ℹ️" });
      pushId(id);
      return id;
    },

    loading: (message: string) => {
      const opts = makeOptions({}, 'loading');
      opts.duration = 4000; // Loading toasts can stay a bit longer
      const id = toast.loading(message, opts);
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
      const loadingOpts = makeOptions({}, 'loading');
      loadingOpts.duration = 4000; // Loading toasts can stay a bit longer
      const loadingId = toast.loading(messages.loading, loadingOpts);
      pushId(loadingId);
      const wrapped = toast.promise(promise, messages, makeOptions({}, 'info'));
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

    // Utility function to force cleanup of inactive toasts
    cleanup: () => {
      cleanInactive();
      while (activeToastIds.length > MAX_TOASTS) {
        const oldest = activeToastIds.shift();
        if (oldest !== undefined) toast.dismiss(oldest);
      }
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
      notifications.error("Unable to export file. Please try again.");
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
