namespace TflDelayRefund.Api.Models;

public sealed record ExpectedJourneyTimeRecord(
    string Line,
    string StartStation,
    string EndStation,
    decimal? DistanceKmNorthbound,
    decimal? DistanceKmSouthbound,
    decimal? OffPeakMinutesNorthbound,
    decimal? OffPeakMinutesSouthbound,
    string Notes
);
