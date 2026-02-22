namespace TflDelayRefund.Api.Models;

public sealed record JourneyRecord(
    string Id,
    string OysterCardId,
    string StartStation,
    string EndStation,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    decimal Fare,
    string RawSource
);
