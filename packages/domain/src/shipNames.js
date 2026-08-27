import { random } from 'garage/util'

// curated, from Iain M. Banks' Culture novels
const CULTURE = split`
far treasure		nostromo
a momentary lapse of sanity           		a series of unlikely explanations                   	a ship with a view
ablation                              		added value                                         	advanced case of chronic patheticism
all the same, i saw it first          		all through with this niceness and negotiation stuff	another fine product from the nonsense factory
appeal to reason                      		arbitrary                                           	arrested development
attitude adjuster                     		awkward customer                                    	bad for business
big sexy beast                        		boo!                                                	bora horza gobuchul
break even                            		but who's counting?                                 	cantankerous
cargo cult                            		charitable view                                     	charming but irrational
congenital optimist                   		conventional wisdom                                 	credibility problem
death and gravity                     		demented but determined                             	determinist
different tan                         		dramatic exit                                       	eschatologist
ethics gradient                       		excuses and accusations                             	experiencing a significant gravitas shortfall
fate amenable to change               		fine till you came along                            	flexible demeanour
frank exchange of views               		frightspear                                         	full refund
funny, it worked last time...         		furious purpose                                     	germane riposte
god told me to do it                  		grey area                                           	gunboat diplomat
halation effect                       		hand me the gun and ask me again                    	happy idiot talk
heavy messing                         		helpless in the face of your beauty                 	heresiarch
highpoint                             		honest mistake                                      	i blame my mother
i blame the parents                   		i blame your mother                                 	i said, i've got a big stick
i thought he was with you             		in one ear                                          	inappropriate response
injury time                           		irregular apocalypse                                	it'll be over by christmas
it's character forming                		jaundiced outlook                                   	just another victim of the ambient morality
just passing through                  		just read the instructions                          	just testing
killing time                          		kiss my ass                                         	kiss the blade
kiss this then                        		lacking that small match temperament                	lapsed pacifist
lasting damage                        		lasting damage i                                    	lasting damage ii
limiting factor                       		limivorous                                          	little rascal
long view                             		lucid nonsense                                      	minority report
misophist                             		nervous energy                                      	never talk to strangers
no fixed abode                        		no more mr nice guy                                 	not invented here
not wanted on voyage                  		now look what you've made me do                     	nuisance value
of course i still love you            		only slightly bent                                  	peace makes plenty
perfidy                               		piety                                               	poke it with a stick
pride comes before a fall             		prime mover                                         	problem child
profit margin                         		prosthetic conscience                               	quietly confident
reasonable excuse                     		recent convert                                      	ravished by the sheer implausibility of that last statement
reformed nice guy                     		resistance is character-forming                     	revisionist
riptalon                              		sacrificial victim                                  	sacslicer ii
sanctioned parts list                 		screw loose                                         	serious callers only
shoot them later                      		size isn't everything                               	sleeper service
so much for subtlety                  		sober counsel                                       	someone else's problem
soulhaven                             		space monster                                       	steely glint
stranger here myself                  		sweet and full of grace                             	synchronize your dogmas
tactical grace                        		thank you and goodnight                             	the anticipation of a new lover's arrival
the ends of invention                 		the precise nature of the catastrophe               	thorough but ... unreliable
trade surplus                         		ultimate ship the second                            	unacceptable behaviour
undesirable alien                     		unfortunate conflict of evidence                    	uninvited guest
unwitting accomplice                  		use psychology                                      	very little gravitas indeed
vulgarian                             		we haven't met but you're a great fan of mine       	well i was in the neighbourhood
what are the civilian applications?   		what is the answer and why?                         	wingclipper
winter storm                          		wisdom like silence                                 	within reason
xenoclast                             		xenophobe                                           	yawning angel
you may not be the coolest person here		you would if you really loved me                    	you'll thank me later
youthful indiscretion                 		zealot                                              	zero credibility	zero gravitas`

const ADJ = split`
wayward    		reckless    	errant      	feral         	wandering  		drifting
rogue      		improbable  	unlikely    	quantum       	last       		lucky
unlucky    		silent      	broken      	rusty         	battered   		gilded
distant    		forgotten   	wistful     	stubborn      	overdue    		undaunted
reluctant  		accidental  	chronic     	perpetual     	marginal   		hollow
nominal    		tentative   	provisional 	unsanctioned  	feckless
shameless  		nameless    	restless    	fickle        	brazen
uncharted  		untamed     	unhinged    	skeptical     	idle
peculiar   		curious     	dubious     	sentimental   	wry`

const NOUN = split`
comet        	horizon   		nebula      	wanderer   		voyager      	drift
reckoning    	paradox   		anomaly     	vagrant    		mirage       	compass
tangent      	vector    		gambit      	verdict    		ember        	static
eclipse      	zenith    		perihelion  	vacuum     		singularity  	ledger
deadline     	refund    		loophole    	overdraft  		excuse       	apology
rumor        	legend    		footnote    	postscript 		prototype    	fable
placeholder  	rebound   		comeback    	interlude  		detour       	signal
longshot     	windfall  		layover     	notion     		omen         	relic
whim         	echo`

const TAIL = split`
regret      	spite          	habit        	instinct     	curiosity
boredom     	principle      	luck         	chance       	doubt
impulse     	nostalgia      	defiance     	convenience  	circumstance
coincidence 	tradition      	optimism     	pessimism    	momentum
inertia     	whimsy         	persistence  	stubbornness 	desperation
ambition    	caution        	recklessness 	patience     	impatience
indecision  	overconfidence 	hindsight    	foresight    	necessity
faith       	reflex`

/*
    3 generators, picked at random each call - the word pools alone give
    tens of thousands of combinations, so ship names stay fresh at scale
    (npc fleets included, not just one starter ship per player).
*/

const GEN = [
    () => pick(CULTURE),
    () => `the ${ pick(ADJ) } ${ pick(NOUN) }`,
    () => `${ pick(ADJ) } ${ pick(NOUN) } of ${ pick(TAIL) }`,
].sort(shuffle)

export default randomShipName
export function randomShipName() {
    return pick(GEN)()
}

function pick(list) {
    return list[ random(list.length) ]
}

function shuffle() {
    return random > .5 ? -1 : 1
}

function split(...a) {
    return String.raw(...a)
        .trim()
        .split(/ *[\t\n]+ */)
        .sort(shuffle)
}
