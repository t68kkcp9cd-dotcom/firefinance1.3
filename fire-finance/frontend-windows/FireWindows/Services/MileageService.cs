using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using System.Timers;
using Microsoft.Extensions.Logging;
using Windows.Devices.Sensors;
using Windows.Foundation;
using FireWindows.Models;
using Newtonsoft.Json;

namespace FireWindows.Services
{
    public class MileageService : IMileageService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<MileageService> _logger;
        private readonly ISettingsService _settingsService;
        private readonly Accelerometer _accelerometer;
        private readonly Timer _motionTimer;
        
        private bool _isMotionDetectionActive;
        private DateTime? _drivingSessionStart;
        private double? _sessionStartOdometer;
        private Queue<MotionSample> _motionHistory;
        private const int MOTION_HISTORY_SIZE = 100;
        private const double DRIVING_SPEED_THRESHOLD = 5.0; // m/s (~11 mph)
        private const int DRIVING_DETECTION_MIN_SAMPLES = 10;

        public event EventHandler<MotionDetectedEventArgs> MotionDetected;
        public event EventHandler<DrivingSessionEventArgs> DrivingSessionStarted;
        public event EventHandler<DrivingSessionEventArgs> DrivingSessionEnded;

        public bool IsMotionDetectionActive => _isMotionDetectionActive;

        public MileageService(
            IHttpClientFactory httpClientFactory,
            ILogger<MileageService> logger,
            ISettingsService settingsService)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _settingsService = settingsService;
            _motionHistory = new Queue<MotionSample>();

            // Initialize accelerometer if available
            try
            {
                _accelerometer = Accelerometer.GetDefault();
                if (_accelerometer != null)
                {
                    _accelerometer.ReportInterval = Math.Max(_accelerometer.MinimumReportInterval, 1000);
                    _accelerometer.ReadingChanged += OnAccelerometerReadingChanged;
                    _logger.LogInformation("Accelerometer initialized successfully");
                }
                else
                {
                    _logger.LogWarning("No accelerometer found on this device");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize accelerometer");
            }

            // Initialize motion timer
            _motionTimer = new Timer(5000); // Check every 5 seconds
            _motionTimer.Elapsed += OnMotionTimerElapsed;
        }

        public async Task StartMotionDetectionAsync()
        {
            if (_isMotionDetectionActive)
                return;

            try
            {
                var settings = await _settingsService.GetSettingsAsync();
                if (!settings.MileageSettings.EnableMotionDetection)
                {
                    _logger.LogInformation("Motion detection is disabled in settings");
                    return;
                }

                _isMotionDetectionActive = true;
                _motionTimer.Start();
                
                _logger.LogInformation("Motion detection started");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start motion detection");
                throw;
            }
        }

        public async Task StopMotionDetectionAsync()
        {
            if (!_isMotionDetectionActive)
                return;

            try
            {
                _isMotionDetectionActive = false;
                _motionTimer.Stop();
                _motionHistory.Clear();
                
                // End current driving session if active
                if (_drivingSessionStart.HasValue)
                {
                    await EndDrivingSessionAsync();
                }
                
                _logger.LogInformation("Motion detection stopped");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to stop motion detection");
                throw;
            }
        }

        private void OnAccelerometerReadingChanged(Accelerometer sender, AccelerometerReadingChangedEventArgs args)
        {
            try
            {
                if (!_isMotionDetectionActive)
                    return;

                var reading = args.Reading;
                var acceleration = Math.Sqrt(
                    reading.AccelerationX * reading.AccelerationX +
                    reading.AccelerationY * reading.AccelerationY +
                    reading.AccelerationZ * reading.AccelerationZ
                );

                var sample = new MotionSample
                {
                    Timestamp = DateTime.Now,
                    Acceleration = acceleration,
                    AccelerationX = reading.AccelerationX,
                    AccelerationY = reading.AccelerationY,
                    AccelerationZ = reading.AccelerationZ
                };

                // Add to history
                _motionHistory.Enqueue(sample);
                if (_motionHistory.Count > MOTION_HISTORY_SIZE)
                {
                    _motionHistory.Dequeue();
                }

                // Analyze motion pattern
                AnalyzeMotionPattern();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing accelerometer reading");
            }
        }

        private void OnMotionTimerElapsed(object sender, ElapsedEventArgs e)
        {
            try
            {
                if (!_isMotionDetectionActive)
                    return;

                // Check if we should prompt user to log mileage
                CheckForDrivingPrompt();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in motion timer elapsed");
            }
        }

        private void AnalyzeMotionPattern()
        {
            if (_motionHistory.Count < DRIVING_DETECTION_MIN_SAMPLES)
                return;

            try
            {
                // Calculate average acceleration variance
                var recentSamples = _motionHistory.Skip(Math.Max(0, _motionHistory.Count - 20)).ToList();
                var avgAcceleration = recentSamples.Average(s => s.Acceleration);
                var variance = recentSamples.Average(s => Math.Pow(s.Acceleration - avgAcceleration, 2));

                // Detect driving based on variance threshold
                bool isDriving = variance > 0.1; // Adjust threshold as needed

                if (isDriving && !_drivingSessionStart.HasValue)
                {
                    // Start new driving session
                    _drivingSessionStart = DateTime.Now;
                    _sessionStartOdometer = null; // Will be set when user logs
                    
                    OnDrivingSessionStarted();
                }
                else if (!isDriving && _drivingSessionStart.HasValue)
                {
                    // End driving session
                    var sessionDuration = DateTime.Now - _drivingSessionStart.Value;
                    if (sessionDuration.TotalMinutes > 5) // Minimum 5 minutes
                    {
                        OnDrivingSessionEnded();
                    }
                }

                // Raise motion detected event
                MotionDetected?.Invoke(this, new MotionDetectedEventArgs
                {
                    Timestamp = DateTime.Now,
                    Speed = avgAcceleration, // Simplified speed calculation
                    IsDriving = isDriving
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error analyzing motion pattern");
            }
        }

        private void CheckForDrivingPrompt()
        {
            if (!_drivingSessionStart.HasValue)
                return;

            var sessionDuration = DateTime.Now - _drivingSessionStart.Value;
            
            // Prompt after 5 minutes of detected driving
            if (sessionDuration.TotalMinutes >= 5)
            {
                // Show notification to log mileage
                _ = PromptUserToLogMileageAsync();
            }
        }

        private async Task PromptUserToLogMileageAsync()
        {
            try
            {
                var notificationService = _host?.Services.GetService<INotificationService>();
                if (notificationService != null)
                {
                    await notificationService.ShowNotificationAsync(
                        "Mileage Tracking",
                        "It looks like you're driving. Would you like to log this trip?",
                        "mileage-prompt",
                        new Dictionary<string, string>
                        {
                            { "sessionStart", _drivingSessionStart?.ToString("O") },
                            { "estimatedEnd", DateTime.Now.ToString("O") }
                        });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error prompting user to log mileage");
            }
        }

        private void OnDrivingSessionStarted()
        {
            _logger.LogInformation("Driving session started at {StartTime}", _drivingSessionStart);
            
            DrivingSessionStarted?.Invoke(this, new DrivingSessionEventArgs
            {
                StartTime = _drivingSessionStart.Value,
                StartOdometer = _sessionStartOdometer,
                IsBusinessDay = IsBusinessDay(DateTime.Now)
            });
        }

        private async void OnDrivingSessionEnded()
        {
            try
            {
                var sessionEnd = DateTime.Now;
                var duration = sessionEnd - _drivingSessionStart.Value;
                
                _logger.LogInformation("Driving session ended at {EndTime}. Duration: {Duration} minutes", 
                    sessionEnd, duration.TotalMinutes);

                DrivingSessionEnded?.Invoke(this, new DrivingSessionEventArgs
                {
                    StartTime = _drivingSessionStart.Value,
                    EndTime = sessionEnd,
                    StartOdometer = _sessionStartOdometer,
                    EndOdometer = null, // Will be set when user logs
                    IsBusinessDay = IsBusinessDay(DateTime.Now)
                });

                // Reset session
                _drivingSessionStart = null;
                _sessionStartOdometer = null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in driving session ended");
            }
        }

        private bool IsBusinessDay(DateTime date)
        {
            // Check if it's a business day based on user settings
            var settings = _settingsService.GetSettingsAsync().Result;
            var dayOfWeek = date.DayOfWeek;
            
            // Default: Monday-Friday are business days
            return dayOfWeek != DayOfWeek.Saturday && dayOfWeek != DayOfWeek.Sunday;
        }

        // IMileageService implementation
        public async Task<IEnumerable<MileageLog>> GetMileageLogsAsync(DateTime? startDate = null, DateTime? endDate = null)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var query = new Dictionary<string, string>();
                
                if (startDate.HasValue)
                    query["startDate"] = startDate.Value.ToString("yyyy-MM-dd");
                if (endDate.HasValue)
                    query["endDate"] = endDate.Value.ToString("yyyy-MM-dd");

                var response = await httpClient.GetAsync($"/api/mileage?{string.Join("&", query.Select(kvp => $"{kvp.Key}={kvp.Value}"))}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<MileageResponse>(content);
                
                return result?.Logs ?? new List<MileageLog>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get mileage logs");
                throw;
            }
        }

        public async Task<MileageLog> GetMileageLogAsync(string logId)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.GetAsync($"/api/mileage/{logId}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<MileageLog>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get mileage log");
                throw;
            }
        }

        public async Task<MileageLog> CreateMileageLogAsync(MileageLog log)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.PostAsJsonAsync("/api/mileage", log);
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<MileageLog>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create mileage log");
                throw;
            }
        }

        public async Task<MileageLog> UpdateMileageLogAsync(MileageLog log)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.PutAsJsonAsync($"/api/mileage/{log.Id}", log);
                response.EnsureSuccessStatusCode();

                return log;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update mileage log");
                throw;
            }
        }

        public async Task DeleteMileageLogAsync(string logId)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.DeleteAsync($"/api/mileage/{logId}");
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete mileage log");
                throw;
            }
        }

        public async Task<IEnumerable<Vehicle>> GetVehiclesAsync()
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.GetAsync("/api/vehicles");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<IEnumerable<Vehicle>>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get vehicles");
                throw;
            }
        }

        public async Task<Vehicle> GetVehicleAsync(string vehicleId)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.GetAsync($"/api/vehicles/{vehicleId}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<Vehicle>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get vehicle");
                throw;
            }
        }

        public async Task<Vehicle> CreateVehicleAsync(Vehicle vehicle)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.PostAsJsonAsync("/api/vehicles", vehicle);
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<Vehicle>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create vehicle");
                throw;
            }
        }

        public async Task<Vehicle> UpdateVehicleAsync(Vehicle vehicle)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.PutAsJsonAsync($"/api/vehicles/{vehicle.Id}", vehicle);
                response.EnsureSuccessStatusCode();

                return vehicle;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update vehicle");
                throw;
            }
        }

        public async Task DeleteVehicleAsync(string vehicleId)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.DeleteAsync($"/api/vehicles/{vehicleId}");
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete vehicle");
                throw;
            }
        }

        public async Task<MileageSummary> GetMileageSummaryAsync(int year, string vehicleId = null)
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var query = vehicleId != null ? $"?year={year}&vehicleId={vehicleId}" : $"?year={year}";
                var response = await httpClient.GetAsync($"/api/mileage/summary{query}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<MileageSummary>(content);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get mileage summary");
                throw;
            }
        }

        public async Task<decimal> CalculateDeductionAsync(int year, string vehicleId = null)
        {
            try
            {
                var summary = await GetMileageSummaryAsync(year, vehicleId);
                return summary.TotalDeductionAmount;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to calculate deduction");
                throw;
            }
        }

        public async Task ExportMileageDataAsync(int year, string format = "csv")
        {
            try
            {
                var httpClient = _httpClientFactory.CreateClient("FireFinanceAPI");
                var response = await httpClient.GetAsync($"/api/mileage/export?year={year}&format={format}");
                response.EnsureSuccessStatusCode();

                var content = await response.Content.ReadAsStreamAsync();
                var filePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    "FireFinance",
                    $"Mileage_{year}.{format}");

                Directory.CreateDirectory(Path.GetDirectoryName(filePath));
                
                using (var fileStream = File.Create(filePath))
                {
                    await content.CopyToAsync(fileStream);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to export mileage data");
                throw;
            }
        }

        public async Task<decimal> GetCurrentIRSRateAsync()
        {
            try
            {
                // In a real implementation, this would fetch from API or database
                var currentYear = DateTime.Now.Year;
                
                // Mock IRS rates - in production, fetch from official source
                var rates = new Dictionary<int, decimal>
                {
                    { 2024, 0.67m },
                    { 2023, 0.655m }
                };

                if (rates.TryGetValue(currentYear, out var rate))
                {
                    return rate;
                }

                // Default to last known rate
                return rates.Values.First();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get current IRS rate");
                return 0.67m; // Default fallback
            }
        }

        public async Task<Dictionary<int, decimal>> GetHistoricalIRSRatesAsync()
        {
            try
            {
                // Mock historical rates - in production, fetch from database
                return new Dictionary<int, decimal>
                {
                    { 2024, 0.67m },
                    { 2023, 0.655m },
                    { 2022, 0.585m },
                    { 2021, 0.56m }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get historical IRS rates");
                return new Dictionary<int, decimal>();
            }
        }

        private class MotionSample
        {
            public DateTime Timestamp { get; set; }
            public double Acceleration { get; set; }
            public double AccelerationX { get; set; }
            public double AccelerationY { get; set; }
            public double AccelerationZ { get; set; }
        }

        private class MileageResponse
        {
            public List<MileageLog> Logs { get; set; }
            public int Total { get; set; }
        }
    }
}