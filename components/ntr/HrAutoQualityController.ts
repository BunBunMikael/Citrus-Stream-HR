export interface HrAutoQualityState {
  jpegQualityAuto: number;
  bandwidthAutoKbps: number;
}

export interface HrAutoQualitySample {
  traffic: boolean;
  packetHealth: number;
  saturation: number;
}

/** Port of NTRViewer-HR's AIMD quality/bandwidth controller for plain UDP JPEG. */
export class HrAutoQualityController {
  private jpegQualityAuto = 95;
  private bandwidthAutoKbps = 16000;
  private qualityCooldown = 2;
  private bandwidthCooldown = 2;
  private qualityCeiling = 95;
  private bandwidthCeilingMbps = 16;

  reset(jpegQualityCeiling: number, bandwidthCeilingMbps: number) {
    this.qualityCeiling = Math.max(10, Math.min(100, Math.round(jpegQualityCeiling)));
    this.bandwidthCeilingMbps = Math.max(4, Math.min(20, Math.round(bandwidthCeilingMbps)));
    this.jpegQualityAuto = this.qualityCeiling;
    this.bandwidthAutoKbps = this.bandwidthCeilingMbps * 1000;
    this.qualityCooldown = 2;
    this.bandwidthCooldown = 2;
  }

  tick(sample: HrAutoQualitySample): HrAutoQualityState {
    if (!sample.traffic) return this.getState();

    if (this.qualityCooldown > 0) {
      this.qualityCooldown -= 1;
    } else {
      const previous = this.jpegQualityAuto;
      let quality = previous;
      if (sample.saturation >= 0.95) {
        quality *= 0.8;
      } else if (sample.saturation < 0.8) {
        const headroom = this.qualityCeiling - quality;
        quality += headroom >= 25 ? 5 : headroom >= 10 ? 3 : 1;
      }
      this.jpegQualityAuto = Math.max(10, Math.min(this.qualityCeiling, Math.trunc(quality)));
      if (this.jpegQualityAuto !== previous) this.qualityCooldown = 1;
    }

    if (sample.packetHealth >= 12.5) {
      if (this.bandwidthCooldown > 0) {
        this.bandwidthCooldown -= 1;
      } else {
        const previous = this.bandwidthAutoKbps;
        let qos = previous;
        if (sample.packetHealth < 95.0) {
          qos *= sample.packetHealth * 0.0095;
        } else if (sample.packetHealth >= 97.5) {
          const headroom = this.bandwidthCeilingMbps * 1000 - qos;
          qos += headroom >= 12000 ? 1200
            : headroom >= 8000 ? 800
              : headroom >= 4000 ? 400
                : headroom >= 2000 ? 200 : 100;
        }
        this.bandwidthAutoKbps = Math.max(4000, Math.min(this.bandwidthCeilingMbps * 1000, Math.trunc(qos)));
        if (this.bandwidthAutoKbps !== previous) this.bandwidthCooldown = 1;
      }
    }

    return this.getState();
  }

  getState(): HrAutoQualityState {
    return {
      jpegQualityAuto: this.jpegQualityAuto,
      bandwidthAutoKbps: this.bandwidthAutoKbps,
    };
  }
}
