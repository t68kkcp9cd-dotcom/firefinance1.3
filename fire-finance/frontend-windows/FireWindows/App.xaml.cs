using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.UI.Xaml;
using Serilog;
using System;
using System.IO;
using Windows.ApplicationModel.Activation;
using WinUIEx;

namespace FireWindows
{
    public partial class App : Application
    {
        private Window m_window;
        private IHost _host;

        public App()
        {
            this.InitializeComponent();
            
            ConfigureLogging();
            ConfigureServices();
        }

        private void ConfigureLogging()
        {
            var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FireFinance", "Logs");
            Directory.CreateDirectory(logPath);

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Debug()
                .WriteTo.File(
                    path: Path.Combine(logPath, "firefinance-.log"),
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 30,
                    outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
                .CreateLogger();
        }

        private void ConfigureServices()
        {
            _host = Host.CreateDefaultBuilder()
                .ConfigureServices((context, services) =>
                {
                    // Register services
                    services.AddSingleton<INavigationService, NavigationService>();
                    services.AddSingleton<IAuthService, AuthService>();
                    services.AddSingleton<IApiService, ApiService>();
                    services.AddSingleton<IWebSocketService, WebSocketService>();
                    services.AddSingleton<INotificationService, NotificationService>();
                    services.AddSingleton<IDataService, DataService>();
                    services.AddSingleton<ISettingsService, SettingsService>();
                    services.AddSingleton<IMileageService, MileageService>();
                    services.AddSingleton<IBusinessService, BusinessService>();

                    // Register view models
                    services.AddTransient<LoginViewModel>();
                    services.AddTransient<DashboardViewModel>();
                    services.AddTransient<AccountsViewModel>();
                    services.AddTransient<TransactionsViewModel>();
                    services.AddTransient<BudgetViewModel>();
                    services.AddTransient<BillsViewModel>();
                    services.AddTransient<GoalsViewModel>();
                    services.AddTransient<ReportsViewModel>();
                    services.AddTransient<SettingsViewModel>();
                    services.AddTransient<CollaborationViewModel>();
                    services.AddTransient<BusinessViewModel>();
                    services.AddTransient<MileageViewModel>();

                    // Register main window
                    services.AddSingleton<MainWindow>();
                })
                .Build();
        }

        protected override void OnLaunched(LaunchActivatedEventArgs args)
        {
            try
            {
                Log.Information("Fire Finance Windows app starting...");

                m_window = _host.Services.GetRequiredService<MainWindow>();
                
                // Configure window
                m_window.Title = "Fire Finance";
                m_window.SetIcon("Assets\\firefinance.ico");
                
                // Set window size and position
                var windowManager = new WindowManager(m_window);
                windowManager.MinWidth = 1024;
                windowManager.MinHeight = 768;
                windowManager.Width = 1280;
                windowManager.Height = 800;
                windowManager.CenterOnScreen();

                // Handle window events
                m_window.Closed += OnWindowClosed;

                // Show window
                m_window.Activate();

                Log.Information("Fire Finance Windows app started successfully");
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "Application startup failed");
                throw;
            }
        }

        private void OnWindowClosed(object sender, WindowEventArgs args)
        {
            try
            {
                Log.Information("Fire Finance Windows app closing...");
                
                // Save settings
                var settingsService = _host.Services.GetService<ISettingsService>();
                settingsService?.SaveSettingsAsync().Wait();

                // Disconnect WebSocket
                var webSocketService = _host.Services.GetService<IWebSocketService>();
                webSocketService?.DisconnectAsync().Wait();

                // Dispose host
                _host?.Dispose();

                Log.Information("Fire Finance Windows app closed");
                Log.CloseAndFlush();
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Error during application shutdown");
            }
        }

        protected override void OnActivated(IActivatedEventArgs args)
        {
            if (args.Kind == ActivationKind.Launch)
            {
                var launchArgs = args as LaunchActivatedEventArgs;
                if (launchArgs?.Arguments != null)
                {
                    HandleProtocolActivation(launchArgs.Arguments);
                }
            }

            base.OnActivated(args);
        }

        private void HandleProtocolActivation(string arguments)
        {
            // Handle custom protocol activation (e.g., firefinance://)
            Log.Information("Protocol activation: {Arguments}", arguments);
            
            // Parse and route to appropriate view
            var navigationService = _host.Services.GetService<INavigationService>();
            if (navigationService != null)
            {
                // Route based on protocol arguments
                if (arguments.Contains("transaction"))
                {
                    navigationService.NavigateTo("Transactions");
                }
                else if (arguments.Contains("budget"))
                {
                    navigationService.NavigateTo("Budget");
                }
                else if (arguments.Contains("bill"))
                {
                    navigationService.NavigateTo("Bills");
                }
            }
        }
    }
}