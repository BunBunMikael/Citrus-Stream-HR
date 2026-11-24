import {HrAutoQualityController} from '../components/ntr/HrAutoQualityController';

describe('HrAutoQualityController', () => {
  it('lowers JPEG quality when the stream is saturated', () => {
    const controller = new HrAutoQualityController();
    controller.reset(95, 16);
    controller.tick({traffic: true, packetHealth: 100, saturation: 1.0});
    controller.tick({traffic: true, packetHealth: 100, saturation: 1.0});
    const state = controller.tick({traffic: true, packetHealth: 100, saturation: 1.0});
    expect(state.jpegQualityAuto).toBe(76);
  });

  it('reduces bandwidth quickly on packet loss and recovers in small steps', () => {
    const controller = new HrAutoQualityController();
    controller.reset(95, 16);
    controller.tick({traffic: true, packetHealth: 100, saturation: 0.5});
    controller.tick({traffic: true, packetHealth: 100, saturation: 0.5});
    const reduced = controller.tick({traffic: true, packetHealth: 80, saturation: 0.5});
    expect(reduced.bandwidthAutoKbps).toBe(12160);
    controller.tick({traffic: true, packetHealth: 100, saturation: 0.5});
    const recovered = controller.tick({traffic: true, packetHealth: 100, saturation: 0.5});
    expect(recovered.bandwidthAutoKbps).toBe(12360);
  });

  it('resets auto values to the user-selected ceilings', () => {
    const controller = new HrAutoQualityController();
    controller.reset(70, 12);
    expect(controller.getState()).toEqual({jpegQualityAuto: 70, bandwidthAutoKbps: 12000});
  });
});
