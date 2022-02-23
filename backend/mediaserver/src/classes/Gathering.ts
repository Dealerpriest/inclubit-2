import { randomUUID } from 'crypto';
import { GatheringState } from 'shared-types/CustomTypes';
import { createMessage } from 'shared-types/MessageTypes';
import mediasoupConfig from '../mediasoupConfig';
import { getMediasoupWorker } from '../modules/mediasoupWorkers';
// import Client from './Client';
import {types as soup} from 'mediasoup';

import Room from './Room';
import Client from './Client';


export default class Gathering {
  // First some static stuff for global housekeeping
  private static gatherings: Map<string, Gathering> = new Map();

  static async createGathering(id?: string, name?: string, worker?: soup.Worker) {
    try {
      const routerOptions: soup.RouterOptions = {};
      if(mediasoupConfig.router.mediaCodecs){
        routerOptions.mediaCodecs = mediasoupConfig.router.mediaCodecs;
      }
      if(!worker){
        worker = getMediasoupWorker();
      }
      const router = await worker.createRouter(routerOptions);
      const gathering = new Gathering(id, name, router);
      return gathering;
    } catch (e) {
      console.error('failed to create gathering');
      throw e;       
    }
  }

  static getGathering(params:{id?: string, name?:string}) {
    if(params.id){

      const gathering = Gathering.gatherings.get(params.id);
      if(!gathering){
        throw new Error('a gathering with that id doesnt exist');
      }
      return gathering;
    }else if(params.name){
      return this.getGatheringFromName(params.name);
    } else {
      throw new Error('no id or name provided. Cant get gathering! Duuuh!');
    }
  }

  private static getGatheringFromName(name:string): Gathering {
    console.log('searching gathering with name:',name);
    for (const [ _ , gathering] of Gathering.gatherings) {
      console.log('checking gathering:', gathering);
      if(gathering.name === name){
        return gathering;
      }
    }
    throw new Error('couldnt find a gathering with that name!!! You fuckhead!');
  }


  id: string;
  name;
  router: soup.Router;

  // Is it a possible security risk that all:ish clients have a reference to the gathering and thus to the sender map?
  private senderClients: Map<string, Client> = new Map();

  private rooms: Map<string, Room> = new Map();

  private clients: Map<string, Client> = new Map();

  private constructor(id = randomUUID(), name = 'unnamed', router: soup.Router){
    this.id = id;
    this.name = name;
    this.router = router;

    const alreadyExistingGathering = Gathering.gatherings.get(this.id);
    if(alreadyExistingGathering){
      console.error('already exists a gathering with that id!');
      throw new Error('cant create gathering with already taken id');
      // return;
    }

    Gathering.gatherings.set(this.id, this);
  }

  addSender(client: Client){
    this.senderClients.set(client.id, client);
    this.broadCastGatheringState();
  }

  removeSender(client: Client){
    this.senderClients.delete(client.id);
    this.broadCastGatheringState();
  }

  getSender (clientId: string){
    const client = this.senderClients.get(clientId);
    if(!client){
      throw new Error('no client with that id in gathering');
    }
    return client;
  }

  addClient ( client : Client){
    this.clients.set(client.id, client);
    // We dont broadcast when a client joins. Broadcast is only relevant when they actually join a room
    // At this stage we send the state back to the joining client so they are up to date with the others.
    this.sendGatheringStateTo(client);
  }

  removeClient (client: Client) {
    // TODO: We should probably broadcast when clients leave
    // TODO: We should also handle if client leaves gathering while in a room. Here or elsewhere
    this.clients.delete(client.id);
  }

  // TODO: Somewhere in the server we probably need to protect access to this function 
  getClient (clientId: string){
    const client = this.clients.get(clientId);
    if(!client){
      throw new Error('no client with that id in gathering');
    }
    return client;
  }

  getRtpCapabilities(): soup.RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  createRoom({roomId, roomName}: {roomId?: string, roomName?: string}){
    // TODO: Pehaps we should verify uniqueness of id if provided? Or do we trust a uuid is provided
    const room = Room.createRoom({roomId, roomName, gathering: this});
    this.rooms.set(room.id, room);
    this.broadCastGatheringState();

    return room;
  }

  sendGatheringStateTo(client: Client){
    const state = this.getGatheringState();
    const msg = createMessage('gatheringStateUpdated', state);
    client.send(msg);
  }

  // TODO: We should throttle some or perhaps all of the broadcast functions so we protect from overload
  broadCastGatheringState(clientsToSkip: string[] = []) {
    const gatheringState = this.getGatheringState();
    console.log(`gonna broadcast to ${this.clients.size} clients`);

    const receivers = [...this.clients, ...this.senderClients];

    receivers.forEach(([_clientId, client]) => {
      if(client.id in clientsToSkip){
        console.log('skipping client:', client.id);
        return;
      }
      const gatheringRoomsMsg = createMessage('gatheringStateUpdated', gatheringState);
      console.log(`sending gatheringStateUpdated to client ${client.id}`);
      client.send(gatheringRoomsMsg);
    });
    // });
  }

  // TODO: will this truly suffice for deleting the room? Or will it float around as a deserted little vessel in the memory ocean?
  deleteRoom(roomOrId: Room | string){
    if(typeof roomOrId === 'string'){
      this.rooms.delete(roomOrId);
      return;
    }
    this.rooms.delete(roomOrId.id);
    this.broadCastGatheringState();
  }

  getGatheringState() {
    const gatheringState: GatheringState = { gatheringId: this.id, rooms: {}, senderClients: {}, clients: {} };
    if(this.name){
      gatheringState.gatheringName = this.name;
    }
    this.rooms.forEach((room) => {
      const roomstate = room.roomState;
      gatheringState.rooms[room.id] = roomstate;
    });
    this.senderClients.forEach(senderClient => {
      gatheringState.senderClients[senderClient.id] = senderClient.clientState;
    });
    this.clients.forEach(client => {
      gatheringState.clients[client.id] = client.clientState;
    });
    return gatheringState;
  }

  getRoom(id: string) {
    const foundRoom = this.rooms.get(id);
    if(!foundRoom){
      console.warn('the gathering doesnt have a room with that id');
      return;
    }
    return foundRoom;
    
  }

  async createWebRtcTransport() {
    const { listenIps, enableUdp, enableTcp, preferUdp, initialAvailableOutgoingBitrate } = mediasoupConfig.webRtcTransport;
    const transport = await this.router.createWebRtcTransport({
      listenIps,
      enableUdp,
      preferUdp,
      enableTcp,
      initialAvailableOutgoingBitrate,
    });

    if(mediasoupConfig.maxIncomingBitrate){
      try{
        await transport.setMaxIncomingBitrate(mediasoupConfig.maxIncomingBitrate);
      } catch (e){
        console.log('failed to set maximum incoming bitrate');
      }
    }

    transport.on('dtlsstatechange', (dtlsState: soup.DtlsState) => {
      if(dtlsState === 'closed'){
        console.log('---transport close--- transport with id ' + transport.id + ' closed');
        transport.close();
      }
    });

    transport.on('close', () => console.log('---transport close--- transport with id ' + transport.id + ' closed'));

    return transport;
  }
}