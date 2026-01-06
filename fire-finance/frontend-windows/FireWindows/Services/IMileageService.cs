using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using FireWindows.Models;

namespace FireWindows.Services
{
    public interface IMileageService
    {
        // Motion detection
        Task StartMotionDetectionAsync();
        Task StopMotionDetectionAsync();
        bool IsMotionDetectionActive { get; }
        
        event EventHandler<MotionDetectedEventArgs> MotionDetected;
        event EventHandler<DrivingSessionEventArgs> DrivingSessionStarted;
        event EventHandler<DrivingSessionEventArgs> DrivingSessionEnded;

        // Mileage logs
        Task<IEnumerable<MileageLog>> GetMileageLogsAsync(DateTime? startDate = null, DateTime? endDate = null);
        Task<MileageLog> GetMileageLogAsync(string logId);
        Task<MileageLog> CreateMileageLogAsync(MileageLog log);
        Task<MileageLog> UpdateMileageLogAsync(MileageLog log);
        Task DeleteMileageLogAsync(string logId);

        // Vehicle management
        Task<IEnumerable<Vehicle>> GetVehiclesAsync();
        Task<Vehicle> GetVehicleAsync(string vehicleId);
        Task<Vehicle> CreateVehicleAsync(Vehicle vehicle);
        Task<Vehicle> UpdateVehicleAsync(Vehicle vehicle);
        Task DeleteVehicleAsync(string vehicleId);

        // Reports and summaries
        Task<MileageSummary> GetMileageSummaryAsync(int year, string vehicleId = null);
        Task<decimal> CalculateDeductionAsync(int year, string vehicleId = null);
        Task ExportMileageDataAsync(int year, string format = "csv");

        // IRS rates
        Task<decimal> GetCurrentIRSRateAsync();
        Task<Dictionary<int, decimal>> GetHistoricalIRSRatesAsync();
    }

    public class MotionDetectedEventArgs : EventArgs
    {
        public DateTime Timestamp { get; set; }
        public double Speed { get; set; }
        public bool IsDriving { get; set; }
    }

    public class DrivingSessionEventArgs : EventArgs
    {
        public DateTime StartTime { get; set; }
        public DateTime? EndTime { get; set; }
        public double? StartOdometer { get; set; }
        public double? EndOdometer { get; set; }
        public bool IsBusinessDay { get; set; }
    }
}